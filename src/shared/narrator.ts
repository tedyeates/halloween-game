import {
  addLog,
  getPlayer,
  killPlayer,
  livingPlayers,
  randomId,
  shuffle,
  type Random,
} from './engineUtils.js';
import {
  beginNight,
  buildNightPrompt,
  nightRoleOrder,
  skipDisconnectedNightAction,
  submitNightAction,
} from './night.js';
import { ROLES } from './roles.js';
import { suggestBluffs, suggestSetup, validateSetup } from './setup.js';
import { STATEMENTS } from './statements.js';
import type {
  GameState,
  NarratorAction,
  NarratorFact,
  NarratorSetup,
  NarratorVisit,
  RoleId,
} from './types.js';

const INFO_ROLES = new Set<RoleId>(['occultist', 'candlemaker', 'coven_cook', 'ghost_whisperer', 'oracle', 'gravedigger']);

export function syncNarratorSetup(state: GameState, rng: Random): void {
  if (state.mode !== 'storyteller' || state.phase !== 'lobby') return;
  if (state.players.length < 5 || state.players.length > 8) {
    state.setup = null;
    return;
  }
  if (!state.setup || state.setup.roles.length !== state.players.length) {
    state.setup = suggestSetup(state.players.length, rng);
  }
}

export function setNarratorSetup(state: GameState, setup: NarratorSetup): void {
  if (state.mode !== 'storyteller') throw new Error('This is not a Storyteller room.');
  if (state.phase !== 'lobby') throw new Error('The game has already begun.');
  validateSetup(state.players.length, setup);
  state.setup = {
    roles: [...setup.roles],
    bluffs: [...setup.bluffs],
  };
}

export function rerollNarratorSetup(state: GameState, rng: Random): void {
  if (state.mode !== 'storyteller') throw new Error('This is not a Storyteller room.');
  if (state.phase !== 'lobby') throw new Error('The game has already begun.');
  if (state.players.length < 5 || state.players.length > 8) throw new Error('Hollowbrook requires 5–8 players.');
  state.setup = suggestSetup(state.players.length, rng);
}

export function startNarratorGame(state: GameState, hostId: string, rng: Random): void {
  if (state.mode !== 'storyteller') throw new Error('This is not a Storyteller room.');
  if (state.hostId !== hostId) throw new Error('Only the Storyteller can start the game.');
  if (state.phase !== 'lobby') throw new Error('The game has already started.');
  if (state.players.length < 5 || state.players.length > 8) throw new Error('Hollowbrook requires 5–8 players.');
  if (!state.setup) state.setup = suggestSetup(state.players.length, rng);
  validateSetup(state.players.length, state.setup);

  const assignments = shuffle(state.setup.roles, rng);
  state.players.forEach((player, index) => {
    player.roleId = assignments[index];
    player.alive = true;
    player.abilityUsed = false;
    player.ghostVoteUsed = false;
    state.privateInfo[player.id] = [];
  });

  const oracle = state.players.find((player) => player.roleId === 'oracle');
  if (oracle) {
    state.redHerringId = shuffle(
      state.players.filter((player) => player.id !== oracle.id && player.roleId && ROLES[player.roleId].team === 'good'),
      rng,
    )[0].id;
  }

  state.phase = 'roleReveal';
  state.log = [];
  // Roles are shown directly on player screens. This pause is for reading and
  // optional introductions; it has no required private visits.
  state.narrator = {
    kind: 'roles',
    visits: [],
    actions: [],
    departures: [],
    allVisited: true,
    facts: [],
    resolved: true,
    pending: null,
  };
  addLog(state, STATEMENTS.welcome, 'story', rng);
  addLog(state, 'Roles are visible privately on every screen. Read carefully; the Storyteller may speak with players before the first night begins.', 'system', rng);
}

export function beginNarratorNight(state: GameState, rng: Random): void {
  state.phase = 'night';
  state.night += 1;
  state.readyPlayerIds = [];
  state.poisonedPlayerId = null;
  state.protectedPlayerId = null;
  state.nightDeaths = [];
  addLog(state, STATEMENTS.nightFalls(state.night), 'story', rng);

  const visits = buildNightVisits(state, rng);
  const actions = buildNarratorActions(state);
  state.narrator = {
    kind: 'night',
    visits,
    actions,
    departures: [],
    allVisited: false,
    facts: [],
    resolved: false,
    pending: null,
  };
  if (actions.length === 0) resolveNarratorNight(state, rng);
}

function buildNightVisits(state: GameState, rng: Random): NarratorVisit[] {
  const order = nightRoleOrder(state.night);
  const reasons = new Map<string, string[]>();
  const addReason = (playerId: string, reason: string) => {
    const current = reasons.get(playerId) ?? [];
    if (!current.includes(reason)) current.push(reason);
    reasons.set(playerId, current);
  };

  for (const player of livingPlayers(state)) {
    if (!player.roleId) continue;
    if (!order.includes(player.roleId)) continue;
    if (buildNightPrompt(state, player)) {
      addReason(player.id, 'Discuss their secret action, then read the outcome privately.');
    }
    if (INFO_ROLES.has(player.roleId)) {
      if (player.roleId === 'occultist' && state.night !== 1) continue;
      if (player.roleId === 'candlemaker' && state.night !== 1) continue;
      if (player.roleId === 'coven_cook' && state.night !== 1) continue;
      if (player.roleId === 'gravedigger' && !state.lastExecutedPlayerId) continue;
      addReason(player.id, 'Deliver their secret information privately.');
    }
  }

  return [...reasons.entries()].map(([playerId, playerReasons]) => ({
    id: randomId(rng),
    playerId,
    reasons: playerReasons,
    done: false,
  }));
}

function buildNarratorActions(state: GameState): NarratorAction[] {
  const order = nightRoleOrder(state.night);
  return livingPlayers(state).flatMap((player) => {
    if (!player.roleId || !order.includes(player.roleId)) return [];
    const prompt = buildNightPrompt(state, player);
    if (!prompt) return [];
    return [{
      playerId: player.id,
      title: prompt.title,
      description: prompt.description,
      targetPlayerIds: prompt.targetPlayerIds,
      selectionCount: prompt.selectionCount,
      targetIds: [],
      note: '',
      submitted: false,
    }];
  });
}

export function submitNarratorAction(
  state: GameState,
  playerId: string,
  targetIds: string[],
  note: string,
  rng: Random,
): void {
  const pause = state.narrator;
  if (state.mode !== 'storyteller' || state.phase !== 'night' || !pause || pause.kind !== 'night') {
    throw new Error('It is not time for a private night action.');
  }
  const action = pause.actions.find((candidate) => candidate.playerId === playerId);
  if (!action) throw new Error('You do not have a night action.');
  if (action.submitted) throw new Error('Your action is already with the Storyteller.');
  if (!Array.isArray(targetIds) || targetIds.length !== action.selectionCount || new Set(targetIds).size !== targetIds.length) {
    throw new Error(`Choose exactly ${action.selectionCount} ${action.selectionCount === 1 ? 'player' : 'players'}.`);
  }
  if (targetIds.some((id) => !action.targetPlayerIds.includes(id))) throw new Error('That target is not available.');
  action.targetIds = [...targetIds];
  action.note = String(note ?? '').trim().slice(0, 240);
  action.submitted = true;
  if (pause.actions.every((candidate) => candidate.submitted)) resolveNarratorNight(state, rng);
}

function resolveNarratorNight(state: GameState, rng: Random): void {
  const pause = state.narrator;
  if (!pause || pause.kind !== 'night') return;
  const working = structuredClone(state);
  working.narrator = null;
  working.log = working.log.slice(0, -1);
  working.night -= 1;
  working.players.forEach((player) => {
    player.connected = true;
  });
  beginNight(working, rng);

  while (working.phase === 'night') {
    const actorId = working.nightActorId;
    if (!actorId) throw new Error('The night could not be resolved.');
    if (pause.departures.includes(actorId)) {
      skipDisconnectedNightAction(working, actorId, rng);
      continue;
    }
    const action = pause.actions.find((candidate) => candidate.playerId === actorId);
    if (!action || !action.submitted) throw new Error(`Waiting for ${getPlayer(state, actorId).name} to submit an action.`);
    submitNightAction(working, actorId, action.targetIds, rng);
  }

  const facts: NarratorFact[] = [];
  for (const player of working.players) {
    for (const entry of working.privateInfo[player.id] ?? []) {
      facts.push({
        id: randomId(rng),
        playerId: player.id,
        text: entry.text,
        hint: entry.source === 'succession'
          ? 'Secret role change: tell this player privately. Their role has changed.'
          : entry.isFalse
            ? 'Poisoned information: this player’s ability was unreliable. Give incorrect or misleading information.'
            : 'True information: phrase it naturally in your own words.',
        isFalse: Boolean(entry.isFalse),
        source: entry.source ?? 'ability',
      });
    }
  }

  pause.facts = facts;
  pause.resolved = true;
  for (const fact of facts) {
    if (!pause.visits.some((visit) => visit.playerId === fact.playerId)) {
      pause.visits.push({
        id: randomId(rng),
        playerId: fact.playerId,
        reasons: [fact.source === 'succession' ? 'Deliver their secret role change.' : 'Deliver their secret information privately.'],
        done: false,
      });
    }
  }

  const newLogs = working.log.slice(state.log.length);
  pause.pending = {
    players: working.players,
    day: working.day,
    night: working.night,
    log: working.log,
    facts,
    publicSummary: newLogs.map((entry) => entry.text),
    winner: working.winner,
    endReason: working.endReason,
    poisonedPlayerId: working.poisonedPlayerId,
    protectedPlayerId: working.protectedPlayerId,
    nightDeaths: working.nightDeaths,
    lastExecutedPlayerId: working.lastExecutedPlayerId,
  };
}

export function handlePlayerDeparture(state: GameState, playerId: string, rng: Random): void {
  if (state.phase === 'lobby' || state.phase === 'gameOver') return;
  const pause = state.narrator;
  if (state.mode === 'storyteller' && state.phase === 'night' && pause?.kind === 'night') {
    if (!pause.departures.includes(playerId)) pause.departures.push(playerId);
    pause.actions = pause.actions.filter((action) => action.playerId !== playerId);
    pause.visits = pause.visits.filter((visit) => visit.playerId !== playerId);
    pause.facts = pause.facts.filter((fact) => fact.playerId !== playerId);
    if (!pause.resolved && pause.actions.every((action) => action.submitted)) {
      resolveNarratorNight(state, rng);
    }
    return;
  }
  applySuicide(state, playerId, rng);
}

function applySuicide(state: GameState, playerId: string, rng: Random): void {
  const player = getPlayer(state, playerId);
  if (!player.alive) return;
  addLog(state, STATEMENTS.suicide(player.name), 'death', rng);
  killPlayer(state, playerId, 'suicide', rng);
  if (state.phase === 'gameOver') state.narrator = null;
}

export function markNarratorVisit(state: GameState, playerId: string, done: boolean): void {
  const pause = state.narrator;
  if (!pause) throw new Error('There is no private pause to update.');
  const visit = pause.visits.find((candidate) => candidate.playerId === playerId);
  if (!visit) throw new Error('That player is not on the required visit list.');
  visit.done = done;
}

export function setNarratorAllVisited(state: GameState, allVisited: boolean): void {
  if (!state.narrator) throw new Error('There is no private pause to update.');
  state.narrator.allVisited = Boolean(allVisited);
}

export function narratorPauseCanFinish(state: GameState): boolean {
  const pause = state.narrator;
  if (!pause) return false;
  if (pause.kind === 'roles') return true;
  if (!pause.allVisited) return false;
  if (!pause.visits.every((visit) => visit.done)) return false;
  return pause.resolved && pause.pending !== null && pause.actions.every((action) => action.submitted);
}

export function finishNarratorPause(state: GameState, rng: Random): void {
  const pause = state.narrator;
  if (!pause) throw new Error('There is no Storyteller pause to finish.');
  if (!narratorPauseCanFinish(state)) throw new Error('Finish the required actions and visits before continuing.');

  if (pause.kind === 'roles') {
    beginNarratorNight(state, rng);
    return;
  }

  const pending = pause.pending!;
  const currentPlayers = new Map(state.players.map((player) => [player.id, player]));
  state.players = pending.players.map((player) => ({
    ...player,
    connected: currentPlayers.get(player.id)?.connected ?? false,
    socketId: currentPlayers.get(player.id)?.socketId,
  }));
  state.day = pending.day;
  state.night = pending.night;
  state.log = pending.log;
  state.winner = pending.winner;
  state.endReason = pending.endReason;
  state.poisonedPlayerId = pending.poisonedPlayerId;
  state.protectedPlayerId = pending.protectedPlayerId;
  state.nightDeaths = pending.nightDeaths;
  state.lastExecutedPlayerId = pending.lastExecutedPlayerId;
  state.readyPlayerIds = [];
  state.activeVote = null;
  state.phase = pending.winner ? 'gameOver' : 'day';

  const departures = [...pause.departures];
  state.narrator = null;
  if (!state.winner) {
    for (const playerId of departures) {
      const player = state.players.find((candidate) => candidate.id === playerId);
      if (!player?.alive) continue;
      applySuicide(state, playerId, rng);
      if (state.phase === 'gameOver') break;
    }
  }
}

export function resetNarratorLobby(state: GameState, rng: Random): void {
  state.mode = 'storyteller';
  state.storytellerId = state.hostId;
  state.setup = state.players.length >= 5 && state.players.length <= 8 ? suggestSetup(state.players.length, rng) : null;
  state.narrator = null;
  state.redHerringId = undefined;
}

export function rerollBluffsOnly(state: GameState, rng: Random): void {
  if (!state.setup) throw new Error('Choose roles before generating bluffs.');
  state.setup.bluffs = suggestBluffs(state.setup.roles, rng);
}
