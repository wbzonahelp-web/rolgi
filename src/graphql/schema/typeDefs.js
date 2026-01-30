/**
 * GraphQL Type Definitions
 * 
 * @module graphql/schema/typeDefs
 * @description
 * Complete GraphQL schema для Rolgi SStats Analytics Platform
 */

const { gql } = require('graphql-tag');

const typeDefs = gql`
  # ============================================================================
  # SCALARS
  # ============================================================================
  
  scalar DateTime
  scalar JSON

  # ============================================================================
  # ENUMS
  # ============================================================================
  
  enum GameStatus {
    SCHEDULED
    LIVE
    FINISHED
    POSTPONED
    CANCELLED
  }

  enum UserRole {
    ADMIN
    ANALYST
    VIEWER
  }

  # ============================================================================
  # TYPES
  # ============================================================================

  type Game {
    id: ID!
    leagueId: Int!
    season: String!
    homeTeamId: Int!
    awayTeamId: Int!
    gameDate: DateTime!
    status: GameStatus!
    homeScore: Int
    awayScore: Int
    stadium: String
    referee: String
    attendance: Int
    createdAt: DateTime!
    updatedAt: DateTime!
    
    # Relations
    league: League
    homeTeam: Team!
    awayTeam: Team!
    odds: [Odds!]
    events: [GameEvent!]
  }

  type Team {
    id: ID!
    name: String!
    shortName: String
    code: String
    logo: String
    country: String
    founded: Int
    stadium: String
    createdAt: DateTime!
    updatedAt: DateTime!
    
    # Relations
    homeGames: [Game!]
    awayGames: [Game!]
    players: [Player!]
    standings: [Standing!]
  }

  type Player {
    id: ID!
    teamId: Int!
    name: String!
    position: String
    number: Int
    age: Int
    nationality: String
    height: Int
    weight: Int
    photo: String
    createdAt: DateTime!
    updatedAt: DateTime!
    
    # Relations
    team: Team!
  }

  type League {
    id: ID!
    name: String!
    country: String!
    logo: String
    season: String!
    createdAt: DateTime!
    updatedAt: DateTime!
    
    # Relations
    games: [Game!]
    standings: [Standing!]
  }

  type Standing {
    id: ID!
    leagueId: Int!
    teamId: Int!
    season: String!
    position: Int!
    played: Int!
    won: Int!
    drawn: Int!
    lost: Int!
    goalsFor: Int!
    goalsAgainst: Int!
    goalDifference: Int!
    points: Int!
    form: String
    createdAt: DateTime!
    updatedAt: DateTime!
    
    # Relations
    league: League!
    team: Team!
  }

  type Odds {
    id: ID!
    gameId: Int!
    bookmaker: String!
    homeWin: Float
    draw: Float
    awayWin: Float
    over25: Float
    under25: Float
    timestamp: DateTime!
    createdAt: DateTime!
    updatedAt: DateTime!
    
    # Relations
    game: Game!
  }

  type GameEvent {
    id: ID!
    gameId: Int!
    minute: Int!
    type: String!
    teamId: Int
    playerId: Int
    detail: String
    createdAt: DateTime!
    
    # Relations
    game: Game!
    team: Team
    player: Player
  }

  type User {
    id: ID!
    username: String!
    email: String!
    role: UserRole!
    isActive: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  # ============================================================================
  # PAGINATION
  # ============================================================================

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
    total: Int!
  }

  type GameConnection {
    edges: [GameEdge!]!
    pageInfo: PageInfo!
  }

  type GameEdge {
    node: Game!
    cursor: String!
  }

  type TeamConnection {
    edges: [TeamEdge!]!
    pageInfo: PageInfo!
  }

  type TeamEdge {
    node: Team!
    cursor: String!
  }

  type PlayerConnection {
    edges: [PlayerEdge!]!
    pageInfo: PageInfo!
  }

  type PlayerEdge {
    node: Player!
    cursor: String!
  }

  # ============================================================================
  # INPUTS
  # ============================================================================

  input GameFilter {
    leagueId: Int
    season: String
    status: GameStatus
    dateFrom: DateTime
    dateTo: DateTime
    teamId: Int
  }

  input TeamFilter {
    country: String
    name: String
  }

  input PlayerFilter {
    teamId: Int
    position: String
    nationality: String
  }

  input StandingFilter {
    leagueId: Int!
    season: String!
  }

  input PaginationInput {
    first: Int
    after: String
    last: Int
    before: String
  }

  # ============================================================================
  # QUERIES
  # ============================================================================

  type Query {
    # Games
    game(id: ID!): Game
    games(filter: GameFilter, pagination: PaginationInput): GameConnection!
    liveGames: [Game!]!
    
    # Teams
    team(id: ID!): Team
    teams(filter: TeamFilter, pagination: PaginationInput): TeamConnection!
    
    # Players
    player(id: ID!): Player
    players(filter: PlayerFilter, pagination: PaginationInput): PlayerConnection!
    
    # Standings
    standings(filter: StandingFilter!): [Standing!]!
    
    # Odds
    liveOdds(gameId: ID!): [Odds!]!
    
    # Users (admin only)
    users: [User!]!
    me: User
    
    # System
    health: HealthStatus!
  }

  type HealthStatus {
    status: String!
    timestamp: DateTime!
    uptime: Float!
    database: Boolean!
  }

  # ============================================================================
  # MUTATIONS
  # ============================================================================

  type Mutation {
    # Data Loader
    loadGames(leagueId: Int!, season: String!): LoadResult!
    loadTeams(leagueId: Int!): LoadResult!
    loadPlayers(teamId: Int!): LoadResult!
    
    # User Management (admin only)
    createUser(input: CreateUserInput!): User!
    updateUser(id: ID!, input: UpdateUserInput!): User!
    deleteUser(id: ID!): DeleteResult!
    
    # Auth
    login(username: String!, password: String!): AuthPayload!
    refreshToken(refreshToken: String!): AuthPayload!
    logout(refreshToken: String!): LogoutResult!
  }

  input CreateUserInput {
    username: String!
    email: String!
    password: String!
    role: UserRole!
  }

  input UpdateUserInput {
    username: String
    email: String
    password: String
    role: UserRole
    isActive: Boolean
  }

  type LoadResult {
    success: Boolean!
    sessionId: String!
    message: String!
    recordsProcessed: Int
  }

  type DeleteResult {
    success: Boolean!
    message: String!
  }

  type LogoutResult {
    success: Boolean!
    message: String!
  }

  type AuthPayload {
    accessToken: String!
    refreshToken: String!
    user: User!
  }

  # ============================================================================
  # SUBSCRIPTIONS
  # ============================================================================

  type Subscription {
    # Game updates (real-time)
    gameUpdated(gameId: ID): Game!
    
    # Live score updates
    liveScoreUpdated(gameId: ID): Game!
    
    # Odds updates
    oddsUpdated(gameId: ID!): Odds!
    
    # Standings updates
    standingsUpdated(leagueId: Int!, season: String!): Standing!
  }
`;

module.exports = typeDefs;
