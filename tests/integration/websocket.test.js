/**
 * WebSocket Server Integration Tests
 * 
 * @group integration
 */

const WebSocket = require('ws');
const http = require('http');
const WSServer = require('../../src/websocket/ws-server');

describe('WebSocket Server', () => {
  let httpServer;
  let wsServer;
  let wsClient;
  const port = 3001;

  beforeAll(() => {
    // Создаём HTTP сервер
    httpServer = http.createServer();
    httpServer.listen(port);

    // Создаём WebSocket сервер
    wsServer = new WSServer(httpServer, {
      path: '/ws',
      heartbeatInterval: 60000, // Отключаем heartbeat в тестах
      maxConnections: 100,
      rateLimitPerMinute: 100
    });
  });

  afterAll(async () => {
    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
      wsClient.close();
    }
    await wsServer.close();
    await new Promise(resolve => httpServer.close(resolve));
  });

  afterEach(() => {
    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
      wsClient.close();
    }
  });

  describe('Connection Management', () => {
    test('should accept WebSocket connections', (done) => {
      wsClient = new WebSocket(`ws://localhost:${port}/ws`);

      wsClient.on('open', () => {
        expect(wsClient.readyState).toBe(WebSocket.OPEN);
        done();
      });

      wsClient.on('error', done);
    });

    test('should send welcome message on connection', (done) => {
      wsClient = new WebSocket(`ws://localhost:${port}/ws`);

      wsClient.on('message', (data) => {
        const message = JSON.parse(data);
        expect(message.type).toBe('connected');
        expect(message.clientId).toBeDefined();
        expect(message.message).toBe('Welcome to Rolgi WebSocket Server');
        done();
      });

      wsClient.on('error', done);
    });

    test('should handle multiple concurrent connections', (done) => {
      const clients = [];
      const connections = 5;
      let connected = 0;

      for (let i = 0; i < connections; i++) {
        const client = new WebSocket(`ws://localhost:${port}/ws`);
        clients.push(client);

        client.on('open', () => {
          connected++;
          if (connected === connections) {
            expect(wsServer.stats.connectionsActive).toBeGreaterThanOrEqual(connections);
            clients.forEach(c => c.close());
            done();
          }
        });

        client.on('error', done);
      }
    });

    test('should track connection statistics', (done) => {
      const initialStats = wsServer.getStats();
      
      wsClient = new WebSocket(`ws://localhost:${port}/ws`);

      wsClient.on('open', () => {
        const newStats = wsServer.getStats();
        expect(newStats.connectionsTotal).toBeGreaterThan(initialStats.connectionsTotal);
        expect(newStats.connectionsActive).toBeGreaterThan(0);
        done();
      });

      wsClient.on('error', done);
    });
  });

  describe('Message Handling', () => {
    beforeEach((done) => {
      wsClient = new WebSocket(`ws://localhost:${port}/ws`);
      wsClient.on('open', done);
      wsClient.on('error', done);
    });

    test('should respond to ping messages', (done) => {
      wsClient.send(JSON.stringify({ type: 'ping' }));

      wsClient.on('message', (data) => {
        const message = JSON.parse(data);
        if (message.type === 'pong') {
          expect(message.timestamp).toBeDefined();
          done();
        }
      });
    });

    test('should handle invalid JSON', (done) => {
      wsClient.send('invalid json');

      wsClient.on('message', (data) => {
        const message = JSON.parse(data);
        if (message.type === 'error') {
          expect(message.error.code).toBe('INVALID_MESSAGE');
          done();
        }
      });
    });

    test('should handle unknown message types', (done) => {
      wsClient.send(JSON.stringify({ type: 'unknown' }));

      wsClient.on('message', (data) => {
        const message = JSON.parse(data);
        if (message.type === 'error') {
          expect(message.error.code).toBe('UNKNOWN_MESSAGE_TYPE');
          done();
        }
      });
    });
  });

  describe('Channel Subscriptions', () => {
    beforeEach((done) => {
      wsClient = new WebSocket(`ws://localhost:${port}/ws`);
      wsClient.on('open', () => {
        // Skip welcome message
        wsClient.once('message', () => done());
      });
      wsClient.on('error', done);
    });

    test('should subscribe to game channel', (done) => {
      wsClient.send(JSON.stringify({
        type: 'subscribe',
        channel: 'game:123'
      }));

      wsClient.on('message', (data) => {
        const message = JSON.parse(data);
        if (message.type === 'subscribed') {
          expect(message.channel).toBe('game:123');
          expect(wsServer.channels.has('game:123')).toBe(true);
          done();
        }
      });
    });

    test('should subscribe to league channel', (done) => {
      wsClient.send(JSON.stringify({
        type: 'subscribe',
        channel: 'league:456'
      }));

      wsClient.on('message', (data) => {
        const message = JSON.parse(data);
        if (message.type === 'subscribed') {
          expect(message.channel).toBe('league:456');
          done();
        }
      });
    });

    test('should subscribe to live channel', (done) => {
      wsClient.send(JSON.stringify({
        type: 'subscribe',
        channel: 'live'
      }));

      wsClient.on('message', (data) => {
        const message = JSON.parse(data);
        if (message.type === 'subscribed') {
          expect(message.channel).toBe('live');
          done();
        }
      });
    });

    test('should reject invalid channel names', (done) => {
      wsClient.send(JSON.stringify({
        type: 'subscribe',
        channel: 'invalid-channel'
      }));

      wsClient.on('message', (data) => {
        const message = JSON.parse(data);
        if (message.type === 'error') {
          expect(message.error.code).toBe('INVALID_CHANNEL');
          done();
        }
      });
    });

    test('should unsubscribe from channel', (done) => {
      // Сначала подписываемся
      wsClient.send(JSON.stringify({
        type: 'subscribe',
        channel: 'game:789'
      }));

      let subscribed = false;

      wsClient.on('message', (data) => {
        const message = JSON.parse(data);
        
        if (message.type === 'subscribed' && !subscribed) {
          subscribed = true;
          // Теперь отписываемся
          wsClient.send(JSON.stringify({
            type: 'unsubscribe',
            channel: 'game:789'
          }));
        } else if (message.type === 'unsubscribed') {
          expect(message.channel).toBe('game:789');
          done();
        }
      });
    });

    test('should handle subscription without channel', (done) => {
      wsClient.send(JSON.stringify({
        type: 'subscribe'
      }));

      wsClient.on('message', (data) => {
        const message = JSON.parse(data);
        if (message.type === 'error') {
          expect(message.error.code).toBe('MISSING_CHANNEL');
          done();
        }
      });
    });
  });

  describe('Broadcasting', () => {
    let client1, client2;

    beforeEach((done) => {
      let connected = 0;
      
      client1 = new WebSocket(`ws://localhost:${port}/ws`);
      client2 = new WebSocket(`ws://localhost:${port}/ws`);

      const checkConnected = () => {
        connected++;
        if (connected === 2) {
          // Skip welcome messages
          client1.once('message', () => {
            client2.once('message', () => {
              done();
            });
          });
        }
      };

      client1.on('open', checkConnected);
      client2.on('open', checkConnected);
      client1.on('error', done);
      client2.on('error', done);
    });

    afterEach(() => {
      if (client1) client1.close();
      if (client2) client2.close();
    });

    test('should broadcast to subscribed clients', (done) => {
      const channel = 'game:999';
      let subscribed = 0;
      let received = 0;

      const messageHandler = (data) => {
        const message = JSON.parse(data);
        
        if (message.type === 'subscribed') {
          subscribed++;
          if (subscribed === 2) {
            // Оба подписаны, отправляем broadcast
            setTimeout(() => {
              wsServer.broadcastToChannel(channel, { score: '2:1' });
            }, 100);
          }
        } else if (message.type === 'game:update') {
          received++;
          expect(message.channel).toBe(channel);
          expect(message.data.score).toBe('2:1');
          
          if (received === 2) {
            done();
          }
        }
      };

      client1.on('message', messageHandler);
      client2.on('message', messageHandler);

      // Подписываем оба клиента
      client1.send(JSON.stringify({ type: 'subscribe', channel }));
      client2.send(JSON.stringify({ type: 'subscribe', channel }));
    });

    test('should not broadcast to unsubscribed clients', (done) => {
      const channel = 'game:888';
      
      // Подписываем только client1
      client1.send(JSON.stringify({ type: 'subscribe', channel }));

      client1.on('message', (data) => {
        const message = JSON.parse(data);
        if (message.type === 'subscribed') {
          // Отправляем broadcast
          const sent = wsServer.broadcastToChannel(channel, { test: 'data' });
          expect(sent).toBe(1); // Только один клиент должен получить
          
          setTimeout(done, 200);
        }
      });

      let client2Received = false;
      client2.on('message', (data) => {
        const message = JSON.parse(data);
        if (message.type === 'game:update') {
          client2Received = true;
        }
      });

      setTimeout(() => {
        expect(client2Received).toBe(false);
      }, 300);
    });
  });

  describe('Rate Limiting', () => {
    beforeEach((done) => {
      wsClient = new WebSocket(`ws://localhost:${port}/ws`);
      wsClient.on('open', () => {
        wsClient.once('message', () => done());
      });
      wsClient.on('error', done);
    });

    test('should enforce rate limits', (done) => {
      const limit = 60; // messages per minute
      let errorReceived = false;

      wsClient.on('message', (data) => {
        const message = JSON.parse(data);
        if (message.type === 'error' && message.error.code === 'RATE_LIMIT_EXCEEDED') {
          errorReceived = true;
        }
      });

      // Отправляем больше сообщений, чем разрешено
      for (let i = 0; i < limit + 10; i++) {
        wsClient.send(JSON.stringify({ type: 'ping' }));
      }

      setTimeout(() => {
        expect(errorReceived).toBe(true);
        done();
      }, 500);
    }, 10000);
  });

  describe('Statistics', () => {
    test('should return server statistics', () => {
      const stats = wsServer.getStats();
      
      expect(stats).toHaveProperty('connectionsTotal');
      expect(stats).toHaveProperty('connectionsActive');
      expect(stats).toHaveProperty('messagesReceived');
      expect(stats).toHaveProperty('messagesSent');
      expect(stats).toHaveProperty('errorsTotal');
      expect(stats).toHaveProperty('uptime');
      expect(stats).toHaveProperty('channels');
    });

    test('should return active channels', () => {
      const channels = wsServer.getActiveChannels();
      expect(Array.isArray(channels)).toBe(true);
    });
  });

  describe('Graceful Shutdown', () => {
    test('should close all connections on shutdown', async () => {
      const client = new WebSocket(`ws://localhost:${port}/ws`);
      
      await new Promise((resolve) => {
        client.on('open', resolve);
      });

      expect(client.readyState).toBe(WebSocket.OPEN);

      // Закрываем сервер
      await wsServer.close();

      // Проверяем, что соединение закрыто
      expect(client.readyState).not.toBe(WebSocket.OPEN);

      // Пересоздаём сервер для следующих тестов
      wsServer = new WSServer(httpServer, {
        path: '/ws',
        heartbeatInterval: 60000,
        maxConnections: 100,
        rateLimitPerMinute: 100
      });
    });
  });
});
