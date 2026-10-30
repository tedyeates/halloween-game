export type Team = 'good' | 'evil';
export type RoleCategory = 'townsfolk' | 'outsider' | 'minion' | 'demon';
export type Phase = 'lobby' | 'roleReveal' | 'night' | 'day' | 'nominations' | 'gameOver';
export type GameMode = 'automated' | 'storyteller';

export type RoleId =
  | 'candlemaker'
  | 'occultist'
  | 'coven_cook'
  | 'ghost_whisperer'
  | 'oracle'
  | 'gravedigger'
  | 'guardian'
  | 'pumpkin_knight'
  | 'witch_hunter'
  | 'harvest_mayor'
  | 'poltergeist'
  | 'doomed'
  | 'bog_witch'
  | 'crimson_heir'
  | 'headless_horseman';

export interface RoleDefinition {
  id: RoleId;
  name: string;
  category: RoleCategory;
  team: Team;
  icon: string;
  summary: string;
  ability: string;
}

export interface Player {
  id: string;
  name: string;
  roleId?: RoleId;
  alive: boolean;
  connected: boolean;
  ghostVoteUsed: boolean;
  abilityUsed: boolean;
  socketId?: string;
}

export interface LogEntry {
  id: string;
  text: string;
  kind: 'story' | 'death' | 'vote' | 'system';
}

export interface PrivateInfo {
  id: string;
  text: string;
  night: number;
  day: number;
  isFalse?: boolean;
  source?: 'ability' | 'succession';
}

export interface VoteState {
  nomineeId: string;
  nominatorId: string;
  eligibleVoterIds: string[];
  votes: Record<string, boolean>;
}

export interface VoteResult {
  nomineeId: string;
  nominatorId: string;
  yesVotes: number;
  eligibleCount: number;
  votes: Record<string, boolean>;
}

export interface NarratorSetup {
  roles: RoleId[];
  bluffs: RoleId[];
}

export interface NarratorVisit {
  id: string;
  playerId: string;
  reasons: string[];
  done: boolean;
}

export interface NarratorAction {
  playerId: string;
  title: string;
  description: string;
  targetPlayerIds: string[];
  selectionCount: 1 | 2;
  targetIds: string[];
  note: string;
  submitted: boolean;
}

export interface NarratorFact {
  id: string;
  playerId: string;
  text: string;
  hint: string;
  isFalse: boolean;
  source: 'ability' | 'succession';
}

export interface NarratorPending {
  players: Player[];
  day: number;
  night: number;
  log: LogEntry[];
  facts: NarratorFact[];
  publicSummary: string[];
  winner: Team | null;
  endReason: string | null;
  poisonedPlayerId: string | null;
  protectedPlayerId: string | null;
  nightDeaths: string[];
  lastExecutedPlayerId: string | null;
}

export interface NarratorPauseState {
  kind: 'roles' | 'night';
  visits: NarratorVisit[];
  actions: NarratorAction[];
  allVisited: boolean;
  facts: NarratorFact[];
  resolved: boolean;
  pending: NarratorPending | null;
}

export interface GameState {
  code: string;
  hostId: string;
  mode: GameMode;
  storytellerId: string | null;
  setup: NarratorSetup | null;
  narrator: NarratorPauseState | null;
  roleDeliveredIds: string[];
  phase: Phase;
  players: Player[];
  day: number;
  night: number;
  log: LogEntry[];
  privateInfo: Record<string, PrivateInfo[]>;
  readyPlayerIds: string[];
  redHerringId?: string;
  poisonedPlayerId: string | null;
  protectedPlayerId: string | null;
  nightDeaths: string[];
  lastExecutedPlayerId: string | null;
  nightQueue: string[];
  nightIndex: number;
  nightActorId: string | null;
  nominationOrder: string[];
  nominationIndex: number;
  nominatedToday: string[];
  activeVote: VoteState | null;
  voteHistory: VoteResult[];
  onBlock: { playerId: string; votes: number } | null;
  winner: Team | null;
  endReason: string | null;
}

export interface NightPrompt {
  roleId: RoleId;
  title: string;
  description: string;
  targetPlayerIds: string[];
  selectionCount: 1 | 2;
  confirmLabel: string;
}

export interface ClientPlayer {
  id: string;
  name: string;
  alive: boolean;
  connected: boolean;
  ghostVoteUsed: boolean;
  abilityUsed: boolean;
}

export interface NarratorActionPrompt {
  roleId: RoleId;
  title: string;
  description: string;
  targetPlayerIds: string[];
  selectionCount: 1 | 2;
  confirmLabel: string;
  selectedTargetIds: string[];
}

export interface NarratorPlayerView {
  pause: 'roles' | 'night';
  roleDelivered: boolean;
  action: NarratorActionPrompt | null;
  actionSubmitted: boolean;
  actionNote: string;
}

export interface ClientVote {
  nomineeId: string;
  nominatorId: string;
  votesSubmitted: number;
  eligibleCount: number;
  canVote: boolean;
  yourVote: boolean | null;
}

export interface ClientState {
  code: string;
  hostId: string;
  mode: GameMode;
  storytellerId: string | null;
  phase: Phase;
  players: ClientPlayer[];
  day: number;
  night: number;
  log: LogEntry[];
  selfId: string;
  selfRole: RoleDefinition | null;
  narrator: NarratorPlayerView | null;
  privateInfo: PrivateInfo[];
  readyPlayerIds: string[];
  prompt: NightPrompt | null;
  currentNominatorId: string | null;
  nominatedToday: string[];
  activeVote: ClientVote | null;
  voteHistory: VoteResult[];
  onBlock: { playerId: string; votes: number } | null;
  winner: Team | null;
  endReason: string | null;
  revealedRoles: Record<string, RoleId> | null;
}

export interface StorytellerPlayer {
  id: string;
  name: string;
  alive: boolean;
  connected: boolean;
  ghostVoteUsed: boolean;
  roleId?: RoleId;
}

export interface StorytellerActionView {
  playerId: string;
  playerName: string;
  roleName: string;
  title: string;
  targetNames: string[];
  note: string;
  submitted: boolean;
}

export interface StorytellerVisitView {
  playerId: string;
  playerName: string;
  roleName: string;
  reasons: string[];
  done: boolean;
}

export interface StorytellerFactView {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  hint: string;
  isFalse: boolean;
}

export interface StorytellerPauseView {
  kind: 'roles' | 'night';
  visits: StorytellerVisitView[];
  actions: StorytellerActionView[];
  facts: StorytellerFactView[];
  allVisited: boolean;
  resolved: boolean;
  publicSummary: string[];
  canFinish: boolean;
}

export interface StorytellerState {
  code: string;
  phase: Phase;
  day: number;
  night: number;
  players: StorytellerPlayer[];
  setup: NarratorSetup | null;
  pause: StorytellerPauseView | null;
  log: LogEntry[];
  winner: Team | null;
  endReason: string | null;
  activeVote: {
    nomineeName: string;
    votesSubmitted: number;
    eligibleCount: number;
  } | null;
}

export interface JoinResult {
  playerId: string;
  reconnectToken: string;
  mode: GameMode;
}

export type ErrorResult = { ok: false; error: string };
export type SuccessResult<T = undefined> = { ok: true } & (T extends undefined ? unknown : { data: T });
export type ActionResult<T = undefined> = ErrorResult | SuccessResult<T>;

export interface ClientToServerEvents {
  'room:create': (payload: { name: string; mode?: GameMode }, callback: (result: ActionResult<JoinResult & { code: string }>) => void) => void;
  'room:join': (payload: { name: string; code: string }, callback: (result: ActionResult<JoinResult & { code: string }>) => void) => void;
  'room:rejoin': (payload: { code: string; playerId: string; reconnectToken: string }, callback: (result: ActionResult<JoinResult & { code: string }>) => void) => void;
  'game:start': (callback: (result: ActionResult) => void) => void;
  'game:restart': (callback: (result: ActionResult) => void) => void;
  'player:ready': (callback: (result: ActionResult) => void) => void;
  'night:act': (payload: { targetIds: string[]; note?: string }, callback: (result: ActionResult) => void) => void;
  'nomination:act': (payload: { targetId: string | null }, callback: (result: ActionResult) => void) => void;
  'vote:cast': (payload: { vote: boolean }, callback: (result: ActionResult) => void) => void;
  'hunter:shoot': (payload: { targetId: string }, callback: (result: ActionResult) => void) => void;
  'room:leave': (callback: (result: ActionResult) => void) => void;
  'host:kick': (payload: { playerId: string }, callback: (result: ActionResult) => void) => void;
  'storyteller:update-setup': (payload: { roles: RoleId[]; bluffs: RoleId[] }, callback: (result: ActionResult) => void) => void;
  'storyteller:reroll': (callback: (result: ActionResult) => void) => void;
  'storyteller:mark-visit': (payload: { playerId: string; done: boolean }, callback: (result: ActionResult) => void) => void;
  'storyteller:all-visited': (payload: { allVisited: boolean }, callback: (result: ActionResult) => void) => void;
  'storyteller:finish-pause': (callback: (result: ActionResult) => void) => void;
}

export interface ServerToClientEvents {
  'state:update': (state: ClientState) => void;
  'storyteller:update': (state: StorytellerState) => void;
  'room:closed': (message: string) => void;
}
