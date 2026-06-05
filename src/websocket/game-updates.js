/**
 * Game Updates Manager
 * 
 * @module websocket/game-updates
 * @description
 * Управление real-time обновлениями игр через WebSocket.
 * Получает обновления из Data Loader Pipeline и рассылает клиентам.
 */

const logger = require('../monitoring/logger');
const { getStatusInfo, isLive } = require('../core/game-status-map');

class GameUpdatesManager {
  constructor(wsServer, dbPool) {
    this.wsServer = wsServer;
    this.dbPool = dbPool;
    
    // Кеш текущих live игр
    this.liveGames = new Map(); // gameId -> gameData
    
    // Интервал обновления
    this.updateInterval = 10000; // 10 секунд
    this.intervalId = null;

    this.setupSnapshotHandler();
  }

  /**
   * Запуск мониторинга live игр
   */
  start() {
    logger.info('Starting Game Updates Manager');
    
    // Первоначальная загрузка live игр
    this.updateLiveGames();
    
    // Периодическое обновление
    this.intervalId = setInterval(() => {
      this.updateLiveGames();
    }, this.updateInterval);

    logger.info('Game Updates Manager started', {
      updateInterval: this.updateInterval
    });
  }

  /**
   * Остановка мониторинга
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Game Updates Manager stopped');
    }
  }

  /**
   * Обновление списка live игр
   */
  async updateLiveGames() {
    try {
        // Получаем все live игры
        const result = await this.dbPool.query(`
          SELECT 
            g.id AS game_id,
            g.league_id,
            g.season AS season_id,
            g.date AS start_time,
            g.status,
            g.home_team_id,
            g.away_team_id,
            g.home_score,
            g.away_score,
            NULL::int AS current_period,
            NULL::int AS minute,
            g.last_updated AS updated_at,
            ht.name AS home_team_name,
            at.name AS away_team_name,
            l.name AS league_name
          FROM games g
          LEFT JOIN teams ht ON g.home_team_id = ht.id
          LEFT JOIN teams at ON g.away_team_id = at.id
          LEFT JOIN leagues l ON g.league_id = l.id
          WHERE g.status = 'live'
            AND g.date >= NOW() - INTERVAL '1 day'
            AND g.date <= NOW() + INTERVAL '6 hours'
          ORDER BY g.date DESC
        `);

        const currentGames = new Map();
        const updates = [];

        for (const game of result.rows) {
          const gameId = game.game_id;
          const previousGame = this.liveGames.get(gameId);
          
          currentGames.set(gameId, game);

          // Проверяем, изменилась ли игра
          if (this.hasGameChanged(previousGame, game)) {
            updates.push(game);
            
            // Отправляем обновление подписчикам
            this.broadcastGameUpdate(game, previousGame);
          }
        }

        // Проверяем завершившиеся игры
        for (const [gameId, oldGame] of this.liveGames.entries()) {
          if (!currentGames.has(gameId)) {
            // Игра завершилась
            this.broadcastGameFinished(oldGame);
          }
        }

        // Обновляем кеш
        this.liveGames = currentGames;

        // Broadcast общего обновления в канал 'live'
        if (updates.length > 0 || this.liveGames.size > 0) {
          this.wsServer.broadcastToChannel('live', {
            games: Array.from(this.liveGames.values()),
            total: this.liveGames.size,
            lastUpdate: new Date().toISOString()
          });
        }

        logger.debug('Live games updated', {
          total: this.liveGames.size,
          changed: updates.length
        });

    } catch (error) {
      // TEMP DEBUG: log raw to stdout to bypass pino serializers
      console.error('=== updateLiveGames ERROR ===');
      console.error('message:', error && error.message);
      console.error('code:', error && error.code);
      console.error('detail:', error && error.detail);
      console.error('stack:', error && error.stack);
      logger.error({ err: error }, 'Error updating live games');
    }
  }

  /**
   * Проверка изменений в игре
   */
  hasGameChanged(oldGame, newGame) {
    if (!oldGame) return true;

    // Проверяем ключевые поля
    return (
      oldGame.home_score !== newGame.home_score ||
      oldGame.away_score !== newGame.away_score ||
      oldGame.status !== newGame.status ||
      oldGame.minute !== newGame.minute ||
      oldGame.current_period !== newGame.current_period ||
      new Date(oldGame.updated_at).getTime() !== new Date(newGame.updated_at).getTime()
    );
  }

  /**
   * Broadcast обновления игры
   */
  broadcastGameUpdate(game, previousGame) {
    const gameId = game.game_id;
    const leagueId = game.league_id;

    // Определяем тип события
    let eventType = 'update';
    if (previousGame) {
      if (previousGame.home_score !== game.home_score || 
          previousGame.away_score !== game.away_score) {
        eventType = 'score_change';
      } else if (previousGame.status !== game.status) {
        eventType = 'status_change';
      }
    }

    const updateData = {
      eventType,
      game: this.formatGameData(game),
      changes: previousGame ? this.getChanges(previousGame, game) : null
    };

    // Отправляем в канал конкретной игры
    this.wsServer.broadcastToChannel(`game:${gameId}`, updateData);
    
    // Отправляем в канал лиги
    this.wsServer.broadcastToChannel(`league:${leagueId}`, updateData);

    logger.info('Game update broadcast', {
      gameId,
      leagueId,
      eventType,
      score: `${game.home_score}:${game.away_score}`,
      subscribers: {
        game: this.wsServer.channels.get(`game:${gameId}`)?.size || 0,
        league: this.wsServer.channels.get(`league:${leagueId}`)?.size || 0
      }
    });
  }

  /**
   * Broadcast завершения игры
   */
  broadcastGameFinished(game) {
    const gameId = game.game_id;
    const leagueId = game.league_id;

    const finishData = {
      eventType: 'game_finished',
      game: this.formatGameData(game)
    };

    this.wsServer.broadcastToChannel(`game:${gameId}`, finishData);
    this.wsServer.broadcastToChannel(`league:${leagueId}`, finishData);

    logger.info('Game finished broadcast', {
      gameId,
      leagueId,
      finalScore: `${game.home_score}:${game.away_score}`
    });
  }

  /**
   * Форматирование данных игры для клиента
   */
  formatGameData(game) {
    return {
      gameId: game.game_id,
      leagueId: game.league_id,
      leagueName: game.league_name,
      seasonId: game.season_id,
      startTime: game.start_time,
      status: game.status,
      statusInfo: getStatusInfo(game.status),
      homeTeam: {
        id: game.home_team_id,
        name: game.home_team_name,
        score: game.home_score
      },
      awayTeam: {
        id: game.away_team_id,
        name: game.away_team_name,
        score: game.away_score
      },
      currentPeriod: game.current_period,
      minute: game.minute,
      updatedAt: game.updated_at
    };
  }

  /**
   * Получение списка изменений
   */
  getChanges(oldGame, newGame) {
    const changes = [];

    if (oldGame.home_score !== newGame.home_score) {
      changes.push({
        field: 'home_score',
        oldValue: oldGame.home_score,
        newValue: newGame.home_score
      });
    }

    if (oldGame.away_score !== newGame.away_score) {
      changes.push({
        field: 'away_score',
        oldValue: oldGame.away_score,
        newValue: newGame.away_score
      });
    }

    if (oldGame.status !== newGame.status) {
      changes.push({
        field: 'status',
        oldValue: oldGame.status,
        newValue: newGame.status
      });
    }

    if (oldGame.minute !== newGame.minute) {
      changes.push({
        field: 'minute',
        oldValue: oldGame.minute,
        newValue: newGame.minute
      });
    }

    return changes;
  }

  /**
   * Настройка обработчика snapshot запросов
   */
  setupSnapshotHandler() {
    this.wsServer.on('snapshot:request', async ({ ws, channel }) => {
      try {
        if (channel === 'live') {
          // Snapshot всех live игр
          this.wsServer.sendToClient(ws, {
            type: 'snapshot',
            channel,
            data: {
              games: Array.from(this.liveGames.values()).map(g => this.formatGameData(g)),
              total: this.liveGames.size
            },
            timestamp: new Date().toISOString()
          });
        } else if (channel.startsWith('game:')) {
          // Snapshot конкретной игры
          const gameId = parseInt(channel.split(':')[1]);
          await this.sendGameSnapshot(ws, gameId);
        } else if (channel.startsWith('league:')) {
          // Snapshot всех игр лиги
          const leagueId = parseInt(channel.split(':')[1]);
          await this.sendLeagueSnapshot(ws, leagueId);
        } else if (channel.startsWith('odds:')) {
          // Snapshot коэффициентов
          const gameId = parseInt(channel.split(':')[1]);
          await this.sendOddsSnapshot(ws, gameId);
        } else if (channel.startsWith('standings:')) {
          // Snapshot турнирной таблицы
          const leagueId = parseInt(channel.split(':')[1]);
          await this.sendStandingsSnapshot(ws, leagueId);
        }
      } catch (error) {
        logger.error('Error sending snapshot', {
          channel,
          error: error.message
        });
      }
    });
  }

  /**
   * Отправка snapshot игры
   */
  async sendGameSnapshot(ws, gameId) {
    const client = await this.dbPool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          g.*,
          ht.name AS home_team_name,
          at.name AS away_team_name,
          l.name AS league_name,
          gs.possession_home,
          gs.possession_away,
          gs.shots_total_home,
          gs.shots_total_away,
          gs.shots_on_target_home,
          gs.shots_on_target_away,
          gs.corners_home,
          gs.corners_away,
          gs.fouls_home,
          gs.fouls_away,
          gs.yellow_cards_home,
          gs.yellow_cards_away,
          gs.red_cards_home,
          gs.red_cards_away
        FROM games g
        LEFT JOIN teams ht ON g.home_team_id = ht.id
        LEFT JOIN teams at ON g.away_team_id = at.id
        LEFT JOIN leagues l ON g.league_id = l.id
        LEFT JOIN game_stats gs ON g.id = gs.game_id
        WHERE g.id = $1
      `, [gameId]);

      if (result.rows.length === 0) {
        this.wsServer.sendError(ws, 'GAME_NOT_FOUND', `Game ${gameId} not found`);
        return;
      }

      const game = result.rows[0];
      
      // Получаем последние события
      const eventsResult = await client.query(`
        SELECT *
        FROM game_events
        WHERE game_id = $1
        ORDER BY event_time DESC
        LIMIT 20
      `, [gameId]);

      this.wsServer.sendToClient(ws, {
        type: 'snapshot',
        channel: `game:${gameId}`,
        data: {
          game: this.formatGameData(game),
          stats: {
            possession: {
              home: game.possession_home,
              away: game.possession_away
            },
            shots: {
              home: { total: game.shots_total_home, onTarget: game.shots_on_target_home },
              away: { total: game.shots_total_away, onTarget: game.shots_on_target_away }
            },
            corners: { home: game.corners_home, away: game.corners_away },
            fouls: { home: game.fouls_home, away: game.fouls_away },
            cards: {
              home: { yellow: game.yellow_cards_home, red: game.red_cards_home },
              away: { yellow: game.yellow_cards_away, red: game.red_cards_away }
            }
          },
          events: eventsResult.rows
        },
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  }

  /**
   * Отправка snapshot лиги
   */
  async sendLeagueSnapshot(ws, leagueId) {
    const client = await this.dbPool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          g.*,
          ht.name AS home_team_name,
          at.name AS away_team_name
        FROM games g
        LEFT JOIN teams ht ON g.home_team_id = ht.id
        LEFT JOIN teams at ON g.away_team_id = at.id
        WHERE g.league_id = $1
          AND g.status IN ('live')
        ORDER BY g.date DESC
      `, [leagueId]);

      this.wsServer.sendToClient(ws, {
        type: 'snapshot',
        channel: `league:${leagueId}`,
        data: {
          games: result.rows.map(g => this.formatGameData(g)),
          total: result.rows.length
        },
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  }

  /**
   * Отправка snapshot коэффициентов
   */
  async sendOddsSnapshot(ws, gameId) {
    const client = await this.dbPool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          o.*,
          b.name AS bookmaker_name
        FROM odds o
        LEFT JOIN bookmakers b ON o.bookmaker_id = b.bookmaker_id
        WHERE o.game_id = $1
        ORDER BY o.last_update DESC
      `, [gameId]);

      this.wsServer.sendToClient(ws, {
        type: 'snapshot',
        channel: `odds:${gameId}`,
        data: {
          odds: result.rows,
          total: result.rows.length
        },
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  }

  /**
   * Отправка snapshot турнирной таблицы
   */
  async sendStandingsSnapshot(ws, leagueId) {
    const client = await this.dbPool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          s.*,
          t.name AS team_name
        FROM standings s
        LEFT JOIN teams t ON s.team_id = t.team_id
        WHERE s.league_id = $1
        ORDER BY s.position ASC
      `, [leagueId]);

      this.wsServer.sendToClient(ws, {
        type: 'snapshot',
        channel: `standings:${leagueId}`,
        data: {
          standings: result.rows,
          total: result.rows.length
        },
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  }

  /**
   * Trigger manual update для игры (вызывается из Data Loader)
   */
  async triggerGameUpdate(gameId) {
    const client = await this.dbPool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          g.*,
          ht.name AS home_team_name,
          at.name AS away_team_name,
          l.name AS league_name
        FROM games g
        LEFT JOIN teams ht ON g.home_team_id = ht.id
        LEFT JOIN teams at ON g.away_team_id = at.id
        LEFT JOIN leagues l ON g.league_id = l.id
        WHERE g.id = $1
      `, [gameId]);

      if (result.rows.length > 0) {
        const game = result.rows[0];
        const previousGame = this.liveGames.get(gameId);
        
        this.broadcastGameUpdate(game, previousGame);
        
        if (isLive(game.status)) {
          this.liveGames.set(gameId, game);
        } else {
          this.liveGames.delete(gameId);
        }
      }

    } finally {
      client.release();
    }
  }
}

module.exports = GameUpdatesManager;
