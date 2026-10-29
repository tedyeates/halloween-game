import {
  addInfo,
  addLog,
  finishGame,
  getPlayer,
  isAbilityWorking,
  killPlayer,
  livingPlayers,
  pick,
  shuffle,
  type Random,
} from './engineUtils.js';
import { beginNight, skipDisconnectedNightAction } from './night.js';
import { beginNarratorNight, resetNarratorLobby, startNarratorGame } from './narrator.js';
import { MINIONS, OUTSIDERS, ROLES, TOWNSFOLK } from './roles.js';
import { SETUP_COUNTS } from './setup.js';
import { STATEMENTS } from './statements.js';
import type { GameMode, GameState, Player, RoleId } from './types.js';

export function createGameState(code: string, hostId: string, mode: GameMode = 'automated'): GameState {
  return {
    code,
    hostId,
    mode,
    storytellerId: mode === 'storyteller' ? hostId : null,
    setup: null,
    narrator: null,
    roleDeliveredIds: [],
    phase: 'lobby',
    players: [],
    day: 0,
    night: 0,
    log: [],
    privateInfo: {},
    readyPlayerIds: [],
    poisonedPlayerId: null,
    protectedPlayerId: null,
    nightDeaths: [],
    lastExecutedPlayerId: null,
    nightQueue: [],
    nightIndex: 0,
    nightActorId: null,
    nominationOrder: [],
    nominationIndex: 0,
    nominatedToday: [],
    activeVote: null,
    voteHistory: [],
    onBlock: null,
    winner: null,
    endReason: null,
  };
}

export function startGame(state: GameState, playerId: string, rng: Random): void {
  if (state.mode === 'storyteller') {
    startNarratorGame(state, playerId, rng);
    return;
  }
  if (state.hostId !== playerId) throw new Error('Only the room creator can start the game.');
  if (state.phase !== 'lobby') throw new Error('The game has already started.');
  const setup = SETUP_COUNTS[state.players.length];
  if (!setup) throw new Error('Hollowbrook requires 5–8 players.');

  const roleIds: RoleId[] = [
    ...shuffle(TOWNSFOLK, rng).slice(0, setup.townsfolk).map((role) => role.id),
    ...shuffle(OUTSIDERS, rng).slice(0, setup.outsiders).map((role) => role.id),
    pick(MINIONS, rng).id,
    'headless_horseman',
  ];
  const assignments = shuffle(roleIds, rng);
  state.players.forEach((player, index) => {
    player.roleId = assignments[index];
    player.alive = true;
    player.abilityUsed = false;
    player.ghostVoteUsed = false;
    state.privateInfo[player.id] = [];
  });

  const oracle = state.players.find((player) => player.roleId === 'oracle');
  if (oracle) {
    state.redHerringId = pick(state.players.filter((player) => player.roleId && ROLES[player.roleId].team === 'good'), rng).id;
  }

  revealEvilPlayers(state, rng);
  state.phase = 'roleReveal';
  state.log = [];
  addLog(state, STATEMENTS.welcome, 'story', rng);
  addLog(state, STATEMENTS.roles, 'system', rng);
}

function revealEvilPlayers(state: GameState, rng: Random): void {
  const demon = state.players.find((player) => player.roleId === 'headless_horseman')!;
  const minions = state.players.filter((player) => player.roleId && ROLES[player.roleId].category === 'minion');
  const goodRolesNotInPlay = shuffle([...TOWNSFOLK, ...OUTSIDERS], rng)
    .filter((role) => !state.players.some((player) => player.roleId === role.id))
    .slice(0, 3);
  for (const minion of minions) {
    addInfo(state, minion.id, `${demon.name} is the Headless Horseman. You are on the evil team together.`, rng);
  }
  addInfo(
    state,
    demon.id,
    `${minions.map((minion) => minion.name).join(', ')} is your Minion. Safe good-role bluffs: ${goodRolesNotInPlay.map((role) => role.name).join(', ')}.`,
    rng,
  );
}

export function markReady(state: GameState, playerId: string, rng: Random): void {
  if (state.mode === 'storyteller' && state.phase === 'roleReveal') {
    throw new Error('The Storyteller will move the game on after private role delivery.');
  }
  if (state.phase !== 'roleReveal' && state.phase !== 'day') throw new Error('There is nothing to ready up for.');
  const player = getPlayer(state, playerId);
  if (state.phase === 'day' && !player.alive) throw new Error('Dead players do not need to ready up.');
  if (!state.readyPlayerIds.includes(playerId)) state.readyPlayerIds.push(playerId);

  if (readyRequirementsMet(state)) {
    if (state.phase === 'roleReveal') beginNight(state, rng);
    else startNominations(state, rng);
  }
}

function readyRequirementsMet(state: GameState): boolean {
  const required = (state.phase === 'roleReveal' ? state.players : livingPlayers(state)).filter((player) => player.connected);
  return required.length > 0 && required.every((candidate) => state.readyPlayerIds.includes(candidate.id));
}

function startNominations(state: GameState, rng: Random): void {
  state.phase = 'nominations';
  state.readyPlayerIds = [];
  state.nominationOrder = livingPlayers(state).map((player) => player.id);
  state.nominationIndex = -1;
  state.nominatedToday = [];
  state.activeVote = null;
  state.voteHistory = [];
  state.onBlock = null;
  advanceNominations(state, rng);
}

export function currentNominator(state: GameState): Player | null {
  if (state.phase !== 'nominations' || state.activeVote) return null;
  return getPlayer(state, state.nominationOrder[state.nominationIndex]);
}

export function actOnNomination(state: GameState, playerId: string, targetId: string | null, rng: Random): void {
  const nominator = currentNominator(state);
  if (!nominator || nominator.id !== playerId) throw new Error('It is not your nomination turn.');
  if (!targetId) {
    addLog(state, STATEMENTS.pass(nominator.name), 'vote', rng);
    advanceNominations(state, rng);
    return;
  }
  const target = getPlayer(state, targetId);
  if (!target.alive || state.nominatedToday.includes(targetId)) throw new Error('That player cannot be nominated.');
  state.nominatedToday.push(targetId);
  state.activeVote = {
    nomineeId: targetId,
    nominatorId: playerId,
    eligibleVoterIds: state.players.filter((player) => player.alive || !player.ghostVoteUsed).map((player) => player.id),
    votes: {},
  };
  addLog(state, STATEMENTS.nomination(nominator.name, target.name), 'vote', rng);
}

export function castVote(state: GameState, playerId: string, vote: boolean, rng: Random): void {
  const ballot = state.activeVote;
  if (state.phase !== 'nominations' || !ballot) throw new Error('There is no open vote.');
  if (typeof vote !== 'boolean') throw new Error('Choose either yes or no.');
  if (!ballot.eligibleVoterIds.includes(playerId) || ballot.votes[playerId] !== undefined) throw new Error('You cannot vote on this nomination.');
  ballot.votes[playerId] = vote;
  const connectedVoters = ballot.eligibleVoterIds.filter((id) => getPlayer(state, id).connected);
  if (connectedVoters.length > 0 && connectedVoters.every((id) => ballot.votes[id] !== undefined)) closeVote(state, rng);
}

function closeVote(state: GameState, rng: Random): void {
  const ballot = state.activeVote!;
  const yesVotes = Object.values(ballot.votes).filter(Boolean).length;
  const nominee = getPlayer(state, ballot.nomineeId);
  state.voteHistory.push({
    nomineeId: ballot.nomineeId,
    nominatorId: ballot.nominatorId,
    yesVotes,
    eligibleCount: ballot.eligibleVoterIds.length,
    votes: { ...ballot.votes },
  });
  addLog(state, STATEMENTS.voteResult(nominee.name, yesVotes, ballot.eligibleVoterIds.length), 'vote', rng);
  for (const [voterId, vote] of Object.entries(ballot.votes)) {
    const voter = getPlayer(state, voterId);
    if (vote && !voter.alive) {
      voter.ghostVoteUsed = true;
      addLog(state, STATEMENTS.ghostVote(voter.name), 'vote', rng);
    }
  }
  const threshold = Math.ceil(livingPlayers(state).length / 2);
  if (yesVotes >= threshold) {
    if (!state.onBlock || yesVotes > state.onBlock.votes) {
      state.onBlock = { playerId: ballot.nomineeId, votes: yesVotes };
      addLog(state, STATEMENTS.onBlock(nominee.name, yesVotes), 'vote', rng);
    } else if (yesVotes === state.onBlock.votes) {
      state.onBlock = null;
      addLog(state, STATEMENTS.tied, 'vote', rng);
    }
  }
  state.activeVote = null;
  advanceNominations(state, rng);
}

function advanceNominations(state: GameState, rng: Random): void {
  state.nominationIndex += 1;
  while (state.nominationIndex < state.nominationOrder.length) {
    const nominator = getPlayer(state, state.nominationOrder[state.nominationIndex]);
    if (nominator.connected) return;
    addLog(state, STATEMENTS.pass(nominator.name), 'vote', rng);
    state.nominationIndex += 1;
  }
  resolveDay(state, rng);
}

function resolveDay(state: GameState, rng: Random): void {
  if (state.onBlock) {
    const executed = getPlayer(state, state.onBlock.playerId);
    state.lastExecutedPlayerId = executed.id;
    addLog(state, STATEMENTS.execution(executed.name), 'death', rng);
    killPlayer(state, executed.id, 'execution', rng);
    if (executed.roleId === 'doomed' && isAbilityWorking(state, executed)) {
      finishGame(state, 'evil', STATEMENTS.doomedWins, rng);
    }
  } else {
    state.lastExecutedPlayerId = null;
    addLog(state, STATEMENTS.noExecution, 'vote', rng);
    const mayor = livingPlayers(state).find((player) => player.roleId === 'harvest_mayor' && isAbilityWorking(state, player));
    if (livingPlayers(state).length === 3 && mayor) {
      finishGame(state, 'good', STATEMENTS.mayorWins, rng);
    }
  }
  if (state.phase !== 'gameOver') {
    if (state.mode === 'storyteller') beginNarratorNight(state, rng);
    else beginNight(state, rng);
  }
}

export function hunterShoot(state: GameState, playerId: string, targetId: string, rng: Random): void {
  if (state.phase !== 'day') throw new Error('The Witch Hunter can only act during discussion.');
  const hunter = getPlayer(state, playerId);
  if (!hunter.alive || hunter.roleId !== 'witch_hunter' || hunter.abilityUsed) throw new Error('Your shot is not available.');
  const target = getPlayer(state, targetId);
  if (!target.alive) throw new Error('Choose a living target.');
  hunter.abilityUsed = true;
  addLog(state, STATEMENTS.hunterShot(hunter.name, target.name), 'death', rng);
  if (target.roleId === 'headless_horseman' && isAbilityWorking(state, hunter)) {
    killPlayer(state, target.id, 'hunter', rng);
  } else {
    addLog(state, STATEMENTS.hunterMiss, 'story', rng);
  }
  if (state.phase === 'day') {
    state.readyPlayerIds = state.readyPlayerIds.filter((id) => getPlayer(state, id).alive);
    if (readyRequirementsMet(state)) startNominations(state, rng);
  }
}

export function reconcileAfterDisconnect(state: GameState, disconnectedPlayerId: string, rng: Random): void {
  state.readyPlayerIds = state.readyPlayerIds.filter((id) => id !== disconnectedPlayerId);
  if (!state.players.some((player) => player.connected)) return;

  for (let step = 0; step < 50; step += 1) {
    if (state.phase === 'roleReveal' || state.phase === 'day') {
      if (!readyRequirementsMet(state)) return;
      if (state.phase === 'roleReveal') beginNight(state, rng);
      else startNominations(state, rng);
      continue;
    }
    if (state.phase === 'night') {
      const actor = state.nightActorId ? getPlayer(state, state.nightActorId) : null;
      if (!actor || actor.connected) return;
      skipDisconnectedNightAction(state, actor.id, rng);
      continue;
    }
    if (state.phase === 'nominations') {
      if (state.activeVote) {
        const connectedVoters = state.activeVote.eligibleVoterIds.filter((id) => getPlayer(state, id).connected);
        if (connectedVoters.length === 0 || !connectedVoters.every((id) => state.activeVote!.votes[id] !== undefined)) return;
        closeVote(state, rng);
        continue;
      }
      const nominatorId = state.nominationOrder[state.nominationIndex];
      const nominator = nominatorId ? getPlayer(state, nominatorId) : null;
      if (!nominator || nominator.connected) return;
      addLog(state, STATEMENTS.pass(nominator.name), 'vote', rng);
      advanceNominations(state, rng);
      continue;
    }
    return;
  }
}

export function restartGame(state: GameState, playerId: string, rng: Random): void {
  if (state.hostId !== playerId) throw new Error('Only the room creator can restart the game.');
  if (state.phase !== 'gameOver') throw new Error('The game is not over.');
  const mode = state.mode;
  const fresh = createGameState(state.code, state.hostId, mode);
  Object.assign(state, fresh, {
    players: state.players.map((player) => ({
      ...player,
      roleId: undefined,
      alive: true,
      ghostVoteUsed: false,
      abilityUsed: false,
    })),
  });
  if (mode === 'storyteller') resetNarratorLobby(state, rng);
  addLog(state, 'A new tale is waiting to be told. The room creator may begin when 5–8 players are present.', 'system', rng);
}
