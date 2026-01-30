/**
 * WebSocket Server для real-time обновлений
 * 
 * @module websocket/ws-server
 * @description
 * WebSocket сервер обеспечивает двустороннюю связь с клиентами для получения
 * обновлений в реальном времени:
 * - Live scores (счета матчей в реальном времени)
 * - Game events (голы, карточки, замены)
 * - Odds updates (изменения коэффициентов)
 * - Standings updates (обновления турнирных таблиц)
 * 
 * Поддерживаемые room channels:
 * - game:{gameId} - обновления конкретного матча
 * - league:{leagueId} - все матчи лиги
 * - live - все live матчи
 * - odds:{gameId} - обновления коэффициентов
 * - standings:{leagueId} - турнирная таблица
 * 
 * Протокол:
 * Client -> Server: { type: 'subscribe', channel: 'game:123' }
 * Server -> Client: { type: 'game:update', data: { ... } }
 */

const WebSocket = require('ws');
const { EventEmitter } = require('events');
const logger = require('../monitoring/logger');

class WSServer extends EventEmitter {
  constructor(server, options = {}) {
    super();
    
    this.options = {
      path: options.path || '/ws',
      heartbeatInterval: options.heartbeatInterval || 30000, // 30 sec
      maxConnections: options.maxConnections || 10000,
      rateLimitPerMinute: options.rateLimitPerMinute || 60,
      ...options
    };

    // WebSocket сервер
    this.wss = new WebSocket.Server({
      server,
      path: this.options.path,
      verifyClient: this.verifyClient.bind(this)
    });

    // Хранилище подключений и подписок
    this.clients = new Map(); // ws -> clientInfo
    this.channels = new Map(); // channel -> Set(ws)
    
    // Статистика
    this.stats = {
      connectionsTotal: 0,
      connectionsActive: 0,
      messagesReceived: 0,
      messagesSent: 0,
      errorsTotal: 0,
      bytesReceived: 0,
      bytesSent: 0
    };

    this.setupEventHandlers();
    this.startHeartbeat();

    logger.info('WebSocket server initialized', {
      path: this.options.path,
      maxConnections: this.options.maxConnections
    });
  }

  /**
   * Проверка клиента перед подключением
   */
  verifyClient(info, callback) {
    const { req } = info;
    
    // Проверка лимита подключений
    if (this.stats.connectionsActive >= this.options.maxConnections) {
      logger.warn('Max connections limit reached', {
        active: this.stats.connectionsActive,
        max: this.options.maxConnections
      });
      return callback(false, 503, 'Server is at capacity');
    }

    // Здесь можно добавить проверку токена из query или headers
    // const token = new URL(req.url, 'ws://localhost').searchParams.get('token');
    // if (!this.validateToken(token)) {
    //   return callback(false, 401, 'Unauthorized');
    // }

    callback(true);
  }

  /**
   * Настройка обработчиков событий
   */
  setupEventHandlers() {
    this.wss.on('connection', this.handleConnection.bind(this));
    
    this.wss.on('error', (error) => {
      logger.error('WebSocket server error', { error: error.message });
      this.stats.errorsTotal++;
    });

    logger.info('WebSocket event handlers configured');
  }

  /**
   * Обработка нового подключения
   */
  handleConnection(ws, req) {
    const clientId = this.generateClientId();
    const clientInfo = {
      id: clientId,
      ip: req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      connectedAt: new Date(),
      lastMessageAt: new Date(),
      subscriptions: new Set(),
      messageCount: 0,
      isAlive: true
    };

    this.clients.set(ws, clientInfo);
    this.stats.connectionsTotal++;
    this.stats.connectionsActive++;

    logger.info('WebSocket client connected', {
      clientId,
      ip: clientInfo.ip,
      activeConnections: this.stats.connectionsActive
    });

    // Приветственное сообщение
    this.sendToClient(ws, {
      type: 'connected',
      clientId,
      timestamp: new Date().toISOString(),
      message: 'Welcome to Rolgi WebSocket Server'
    });

    // Обработчики событий клиента
    ws.on('message', (data) => this.handleMessage(ws, data));
    ws.on('close', () => this.handleDisconnect(ws));
    ws.on('error', (error) => this.handleError(ws, error));
    ws.on('pong', () => this.handlePong(ws));
  }

  /**
   * Обработка сообщения от клиента
   */
  async handleMessage(ws, data) {
    const clientInfo = this.clients.get(ws);
    if (!clientInfo) return;

    this.stats.messagesReceived++;
    this.stats.bytesReceived += data.length;
    clientInfo.lastMessageAt = new Date();
    clientInfo.messageCount++;

    // Rate limiting
    if (!this.checkRateLimit(clientInfo)) {
      this.sendError(ws, 'RATE_LIMIT_EXCEEDED', 'Too many messages per minute');
      return;
    }

    try {
      const message = JSON.parse(data);
      
      logger.debug('WebSocket message received', {
        clientId: clientInfo.id,
        type: message.type,
        channel: message.channel
      });

      switch (message.type) {
        case 'subscribe':
          await this.handleSubscribe(ws, message);
          break;
          
        case 'unsubscribe':
          await this.handleUnsubscribe(ws, message);
          break;
          
        case 'ping':
          this.sendToClient(ws, { type: 'pong', timestamp: new Date().toISOString() });
          break;
          
        default:
          this.sendError(ws, 'UNKNOWN_MESSAGE_TYPE', `Unknown message type: ${message.type}`);
      }
    } catch (error) {
      logger.error('Error handling WebSocket message', {
        clientId: clientInfo.id,
        error: error.message,
        data: data.toString()
      });
      this.sendError(ws, 'INVALID_MESSAGE', error.message);
      this.stats.errorsTotal++;
    }
  }

  /**
   * Подписка на канал
   */
  async handleSubscribe(ws, message) {
    const clientInfo = this.clients.get(ws);
    const { channel } = message;

    if (!channel) {
      this.sendError(ws, 'MISSING_CHANNEL', 'Channel name is required');
      return;
    }

    // Валидация канала
    if (!this.validateChannel(channel)) {
      this.sendError(ws, 'INVALID_CHANNEL', `Invalid channel: ${channel}`);
      return;
    }

    // Добавляем подписку
    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set());
    }
    
    this.channels.get(channel).add(ws);
    clientInfo.subscriptions.add(channel);

    logger.info('Client subscribed to channel', {
      clientId: clientInfo.id,
      channel,
      totalSubscribers: this.channels.get(channel).size
    });

    this.sendToClient(ws, {
      type: 'subscribed',
      channel,
      timestamp: new Date().toISOString()
    });

    // Отправляем текущее состояние канала
    await this.sendChannelSnapshot(ws, channel);
  }

  /**
   * Отписка от канала
   */
  async handleUnsubscribe(ws, message) {
    const clientInfo = this.clients.get(ws);
    const { channel } = message;

    if (!channel) {
      this.sendError(ws, 'MISSING_CHANNEL', 'Channel name is required');
      return;
    }

    // Удаляем подписку
    if (this.channels.has(channel)) {
      this.channels.get(channel).delete(ws);
      if (this.channels.get(channel).size === 0) {
        this.channels.delete(channel);
      }
    }
    
    clientInfo.subscriptions.delete(channel);

    logger.info('Client unsubscribed from channel', {
      clientId: clientInfo.id,
      channel
    });

    this.sendToClient(ws, {
      type: 'unsubscribed',
      channel,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Обработка отключения клиента
   */
  handleDisconnect(ws) {
    const clientInfo = this.clients.get(ws);
    if (!clientInfo) return;

    // Удаляем из всех каналов
    for (const channel of clientInfo.subscriptions) {
      if (this.channels.has(channel)) {
        this.channels.get(channel).delete(ws);
        if (this.channels.get(channel).size === 0) {
          this.channels.delete(channel);
        }
      }
    }

    this.clients.delete(ws);
    this.stats.connectionsActive--;

    logger.info('WebSocket client disconnected', {
      clientId: clientInfo.id,
      sessionDuration: Date.now() - clientInfo.connectedAt.getTime(),
      messagesReceived: clientInfo.messageCount,
      activeConnections: this.stats.connectionsActive
    });
  }

  /**
   * Обработка ошибки клиента
   */
  handleError(ws, error) {
    const clientInfo = this.clients.get(ws);
    logger.error('WebSocket client error', {
      clientId: clientInfo?.id,
      error: error.message
    });
    this.stats.errorsTotal++;
  }

  /**
   * Обработка pong от клиента
   */
  handlePong(ws) {
    const clientInfo = this.clients.get(ws);
    if (clientInfo) {
      clientInfo.isAlive = true;
    }
  }

  /**
   * Heartbeat для проверки живых подключений
   */
  startHeartbeat() {
    setInterval(() => {
      const deadClients = [];
      
      for (const [ws, clientInfo] of this.clients.entries()) {
        if (clientInfo.isAlive === false) {
          deadClients.push(ws);
          ws.terminate();
          continue;
        }
        
        clientInfo.isAlive = false;
        ws.ping();
      }

      if (deadClients.length > 0) {
        logger.info('Heartbeat: terminated dead connections', {
          count: deadClients.length
        });
      }
    }, this.options.heartbeatInterval);
  }

  /**
   * Отправка сообщения клиенту
   */
  sendToClient(ws, message) {
    if (ws.readyState !== WebSocket.OPEN) return;

    try {
      const data = JSON.stringify(message);
      ws.send(data);
      this.stats.messagesSent++;
      this.stats.bytesSent += data.length;
    } catch (error) {
      logger.error('Error sending message to client', {
        error: error.message
      });
    }
  }

  /**
   * Отправка сообщения об ошибке
   */
  sendError(ws, code, message) {
    this.sendToClient(ws, {
      type: 'error',
      error: {
        code,
        message
      },
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Broadcast сообщения в канал
   */
  broadcastToChannel(channel, message) {
    const subscribers = this.channels.get(channel);
    if (!subscribers || subscribers.size === 0) return;

    const data = {
      type: `${channel.split(':')[0]}:update`,
      channel,
      data: message,
      timestamp: new Date().toISOString()
    };

    let sentCount = 0;
    for (const ws of subscribers) {
      if (ws.readyState === WebSocket.OPEN) {
        this.sendToClient(ws, data);
        sentCount++;
      }
    }

    logger.debug('Broadcast to channel', {
      channel,
      subscribers: subscribers.size,
      sent: sentCount
    });

    return sentCount;
  }

  /**
   * Отправка snapshot состояния канала
   */
  async sendChannelSnapshot(ws, channel) {
    // Эмитим событие для получения snapshot от external источников
    // Например, от database или cache
    this.emit('snapshot:request', { ws, channel });
  }

  /**
   * Валидация канала
   */
  validateChannel(channel) {
    const validPatterns = [
      /^game:\d+$/,           // game:123
      /^league:\d+$/,         // league:456
      /^live$/,               // live
      /^odds:\d+$/,           // odds:123
      /^standings:\d+$/       // standings:456
    ];

    return validPatterns.some(pattern => pattern.test(channel));
  }

  /**
   * Проверка rate limit
   */
  checkRateLimit(clientInfo) {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Простая проверка: количество сообщений в минуту
    // В production можно использовать более сложную логику или Redis
    if (!clientInfo.rateLimitWindow) {
      clientInfo.rateLimitWindow = { start: now, count: 0 };
    }

    if (clientInfo.rateLimitWindow.start < oneMinuteAgo) {
      clientInfo.rateLimitWindow = { start: now, count: 1 };
      return true;
    }

    clientInfo.rateLimitWindow.count++;
    return clientInfo.rateLimitWindow.count <= this.options.rateLimitPerMinute;
  }

  /**
   * Генерация ID клиента
   */
  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Получение списка активных каналов
   */
  getActiveChannels() {
    const channels = [];
    for (const [channel, subscribers] of this.channels.entries()) {
      channels.push({
        channel,
        subscribers: subscribers.size
      });
    }
    return channels;
  }

  /**
   * Получение статистики
   */
  getStats() {
    return {
      ...this.stats,
      uptime: process.uptime(),
      channels: this.channels.size,
      avgMessagesPerClient: this.stats.connectionsTotal > 0 
        ? Math.round(this.stats.messagesReceived / this.stats.connectionsTotal)
        : 0
    };
  }

  /**
   * Закрытие сервера
   */
  async close() {
    logger.info('Closing WebSocket server...');
    
    // Закрываем все подключения
    for (const ws of this.clients.keys()) {
      ws.close(1000, 'Server shutting down');
    }

    return new Promise((resolve) => {
      this.wss.close(() => {
        logger.info('WebSocket server closed');
        resolve();
      });
    });
  }
}

module.exports = WSServer;
