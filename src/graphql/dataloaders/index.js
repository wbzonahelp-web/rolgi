/**
 * GraphQL DataLoaders
 * 
 * @module graphql/dataloaders
 * @description
 * DataLoader для batch loading и кэширования данных.
 * Решает проблему N+1 queries.
 */

const DataLoader = require('dataloader');

/**
 * Create all dataloaders
 * @param {Object} db - Database instance
 * @returns {Object} Dataloaders
 */
function createDataLoaders(db) {
  // ============================================================================
  // TEAM DATALOADER
  // ============================================================================
  
  const teamLoader = new DataLoader(async (teamIds) => {
    const query = 'SELECT * FROM teams WHERE id = ANY($1::int[])';
    const result = await db.query(query, [teamIds]);
    
    // Create map for O(1) lookup
    const teamMap = new Map();
    result.rows.forEach(team => {
      teamMap.set(team.id, team);
    });
    
    // Return teams in same order as requested IDs
    return teamIds.map(id => teamMap.get(id) || null);
  });

  // ============================================================================
  // PLAYER DATALOADER
  // ============================================================================
  
  const playerLoader = new DataLoader(async (playerIds) => {
    const query = 'SELECT * FROM players WHERE id = ANY($1::int[])';
    const result = await db.query(query, [playerIds]);
    
    const playerMap = new Map();
    result.rows.forEach(player => {
      playerMap.set(player.id, player);
    });
    
    return playerIds.map(id => playerMap.get(id) || null);
  });

  // ============================================================================
  // LEAGUE DATALOADER
  // ============================================================================
  
  const leagueLoader = new DataLoader(async (leagueIds) => {
    const query = 'SELECT * FROM leagues WHERE id = ANY($1::int[])';
    const result = await db.query(query, [leagueIds]);
    
    const leagueMap = new Map();
    result.rows.forEach(league => {
      leagueMap.set(league.id, league);
    });
    
    return leagueIds.map(id => leagueMap.get(id) || null);
  });

  // ============================================================================
  // GAME DATALOADER
  // ============================================================================
  
  const gameLoader = new DataLoader(async (gameIds) => {
    const query = 'SELECT * FROM games WHERE id = ANY($1::int[])';
    const result = await db.query(query, [gameIds]);
    
    const gameMap = new Map();
    result.rows.forEach(game => {
      gameMap.set(game.id, game);
    });
    
    return gameIds.map(id => gameMap.get(id) || null);
  });

  // ============================================================================
  // ODDS DATALOADER (by game_id)
  // ============================================================================
  
  const oddsByGameLoader = new DataLoader(async (gameIds) => {
    const query = `
      SELECT * FROM odds 
      WHERE game_id = ANY($1::int[])
      ORDER BY timestamp DESC
    `;
    const result = await db.query(query, [gameIds]);
    
    // Group odds by game_id
    const oddsMap = new Map();
    gameIds.forEach(id => oddsMap.set(id, []));
    
    result.rows.forEach(odd => {
      const gameOdds = oddsMap.get(odd.game_id) || [];
      gameOdds.push(odd);
      oddsMap.set(odd.game_id, gameOdds);
    });
    
    return gameIds.map(id => oddsMap.get(id) || []);
  });

  // ============================================================================
  // PLAYERS BY TEAM DATALOADER
  // ============================================================================
  
  const playersByTeamLoader = new DataLoader(async (teamIds) => {
    const query = `
      SELECT * FROM players 
      WHERE team_id = ANY($1::int[])
      ORDER BY number ASC
    `;
    const result = await db.query(query, [teamIds]);
    
    // Group players by team_id
    const playersMap = new Map();
    teamIds.forEach(id => playersMap.set(id, []));
    
    result.rows.forEach(player => {
      const teamPlayers = playersMap.get(player.team_id) || [];
      teamPlayers.push(player);
      playersMap.set(player.team_id, teamPlayers);
    });
    
    return teamIds.map(id => playersMap.get(id) || []);
  });

  // ============================================================================
  // STANDINGS BY TEAM DATALOADER
  // ============================================================================
  
  const standingsByTeamLoader = new DataLoader(async (teamIds) => {
    const query = `
      SELECT * FROM standings 
      WHERE team_id = ANY($1::int[])
      ORDER BY season DESC, position ASC
    `;
    const result = await db.query(query, [teamIds]);
    
    // Group standings by team_id
    const standingsMap = new Map();
    teamIds.forEach(id => standingsMap.set(id, []));
    
    result.rows.forEach(standing => {
      const teamStandings = standingsMap.get(standing.team_id) || [];
      teamStandings.push(standing);
      standingsMap.set(standing.team_id, teamStandings);
    });
    
    return teamIds.map(id => standingsMap.get(id) || []);
  });

  // ============================================================================
  // GAMES BY TEAM DATALOADER (home games)
  // ============================================================================
  
  const homeGamesByTeamLoader = new DataLoader(async (teamIds) => {
    const query = `
      SELECT * FROM games 
      WHERE home_team_id = ANY($1::int[])
      ORDER BY game_date DESC
      LIMIT 10
    `;
    const result = await db.query(query, [teamIds]);
    
    const gamesMap = new Map();
    teamIds.forEach(id => gamesMap.set(id, []));
    
    result.rows.forEach(game => {
      const homeGames = gamesMap.get(game.home_team_id) || [];
      homeGames.push(game);
      gamesMap.set(game.home_team_id, homeGames);
    });
    
    return teamIds.map(id => gamesMap.get(id) || []);
  });

  // ============================================================================
  // GAMES BY TEAM DATALOADER (away games)
  // ============================================================================
  
  const awayGamesByTeamLoader = new DataLoader(async (teamIds) => {
    const query = `
      SELECT * FROM games 
      WHERE away_team_id = ANY($1::int[])
      ORDER BY game_date DESC
      LIMIT 10
    `;
    const result = await db.query(query, [teamIds]);
    
    const gamesMap = new Map();
    teamIds.forEach(id => gamesMap.set(id, []));
    
    result.rows.forEach(game => {
      const awayGames = gamesMap.get(game.away_team_id) || [];
      awayGames.push(game);
      gamesMap.set(game.away_team_id, awayGames);
    });
    
    return teamIds.map(id => gamesMap.get(id) || []);
  });

  // ============================================================================
  // USER DATALOADER
  // ============================================================================
  
  const userLoader = new DataLoader(async (userIds) => {
    const query = 'SELECT * FROM users WHERE id = ANY($1::int[])';
    const result = await db.query(query, [userIds]);
    
    const userMap = new Map();
    result.rows.forEach(user => {
      // Remove password_hash from response
      delete user.password_hash;
      userMap.set(user.id, user);
    });
    
    return userIds.map(id => userMap.get(id) || null);
  });

  return {
    teamLoader,
    playerLoader,
    leagueLoader,
    gameLoader,
    oddsByGameLoader,
    playersByTeamLoader,
    standingsByTeamLoader,
    homeGamesByTeamLoader,
    awayGamesByTeamLoader,
    userLoader,
  };
}

module.exports = { createDataLoaders };
