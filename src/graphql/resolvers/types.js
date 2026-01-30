/**
 * GraphQL Type Resolvers (Field Resolvers)
 * 
 * @module graphql/resolvers/types
 * @description
 * Resolvers для полей типов (связи между сущностями)
 */

const typeResolvers = {
  // ============================================================================
  // GAME TYPE
  // ============================================================================
  
  Game: {
    async league(parent, args, context) {
      if (!parent.league_id) return null;
      const { dataloaders } = context;
      return await dataloaders.leagueLoader.load(parent.league_id);
    },

    async homeTeam(parent, args, context) {
      const { dataloaders } = context;
      return await dataloaders.teamLoader.load(parent.home_team_id);
    },

    async awayTeam(parent, args, context) {
      const { dataloaders } = context;
      return await dataloaders.teamLoader.load(parent.away_team_id);
    },

    async odds(parent, args, context) {
      const { dataloaders } = context;
      return await dataloaders.oddsByGameLoader.load(parent.id);
    },

    async events(parent, args, context) {
      const { db } = context;
      return await db.select('game_events', { game_id: parent.id }, {
        orderBy: 'minute ASC',
      });
    },
  },

  // ============================================================================
  // TEAM TYPE
  // ============================================================================
  
  Team: {
    async homeGames(parent, args, context) {
      const { dataloaders } = context;
      return await dataloaders.homeGamesByTeamLoader.load(parent.id);
    },

    async awayGames(parent, args, context) {
      const { dataloaders } = context;
      return await dataloaders.awayGamesByTeamLoader.load(parent.id);
    },

    async players(parent, args, context) {
      const { dataloaders } = context;
      return await dataloaders.playersByTeamLoader.load(parent.id);
    },

    async standings(parent, args, context) {
      const { dataloaders } = context;
      return await dataloaders.standingsByTeamLoader.load(parent.id);
    },
  },

  // ============================================================================
  // PLAYER TYPE
  // ============================================================================
  
  Player: {
    async team(parent, args, context) {
      const { dataloaders } = context;
      return await dataloaders.teamLoader.load(parent.team_id);
    },
  },

  // ============================================================================
  // LEAGUE TYPE
  // ============================================================================
  
  League: {
    async games(parent, args, context) {
      const { db } = context;
      return await db.select('games', { league_id: parent.id }, {
        orderBy: 'game_date DESC',
        limit: 100,
      });
    },

    async standings(parent, args, context) {
      const { db } = context;
      return await db.select('standings', { 
        league_id: parent.id,
        season: parent.season,
      }, {
        orderBy: 'position ASC',
      });
    },
  },

  // ============================================================================
  // STANDING TYPE
  // ============================================================================
  
  Standing: {
    async league(parent, args, context) {
      const { dataloaders } = context;
      return await dataloaders.leagueLoader.load(parent.league_id);
    },

    async team(parent, args, context) {
      const { dataloaders } = context;
      return await dataloaders.teamLoader.load(parent.team_id);
    },
  },

  // ============================================================================
  // ODDS TYPE
  // ============================================================================
  
  Odds: {
    async game(parent, args, context) {
      const { dataloaders } = context;
      return await dataloaders.gameLoader.load(parent.game_id);
    },
  },

  // ============================================================================
  // GAME EVENT TYPE
  // ============================================================================
  
  GameEvent: {
    async game(parent, args, context) {
      const { dataloaders } = context;
      return await dataloaders.gameLoader.load(parent.game_id);
    },

    async team(parent, args, context) {
      if (!parent.team_id) return null;
      const { dataloaders } = context;
      return await dataloaders.teamLoader.load(parent.team_id);
    },

    async player(parent, args, context) {
      if (!parent.player_id) return null;
      const { dataloaders } = context;
      return await dataloaders.playerLoader.load(parent.player_id);
    },
  },
};

module.exports = typeResolvers;
