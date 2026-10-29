import { describe, expect, it } from 'vitest';
import {
  actOnNomination,
  castVote,
  createGameState,
  currentNominator,
  hunterShoot,
  markReady,
  reconcileAfterDisconnect,
  startGame,
} from './engine.js';
import { beginNight, submitNightAction } from './night.js';
import { stateForPlayer } from './sanitize.js';
import type { GameState, RoleId } from './types.js';

const rng = () => 0.42;

function makeState(roleIds: RoleId[], phase: GameState['phase'] = 'roleReveal'): GameState {
  const state = createGameState('TEST', 'p0');
  state.phase = phase;
  state.players = roleIds.map((roleId, index) => ({
    id: `p${index}`,
    name: `Player ${index}`,
    roleId,
    alive: true,
    connected: true,
    ghostVoteUsed: false,
    abilityUsed: false,
  }));
  for (const player of state.players) state.privateInfo[player.id] = [];
  return state;
}

function readyEveryone(state: GameState): void {
  for (const player of [...state.players]) {
    if (player.alive && (state.phase === 'roleReveal' || state.phase === 'day')) markReady(state, player.id, rng);
  }
}

describe('game setup', () => {
  it.each([5, 6, 7, 8])('creates a legal %i-player composition', (count) => {
    const state = createGameState('TEST', 'p0');
    state.players = Array.from({ length: count }, (_, index) => ({
      id: `p${index}`,
      name: `Player ${index}`,
      alive: true,
      connected: true,
      ghostVoteUsed: false,
      abilityUsed: false,
    }));
    startGame(state, 'p0', rng);
    expect(state.players).toHaveLength(count);
    expect(state.players.filter((player) => player.roleId === 'headless_horseman')).toHaveLength(1);
    expect(new Set(state.players.map((player) => player.roleId)).size).toBe(count);
    expect(state.phase).toBe('roleReveal');
    expect(state.players.every((player) => player.roleId)).toBe(true);
  });

  it('never sends another player’s role or night prompt to a client', () => {
    const state = makeState(['bog_witch', 'candlemaker', 'oracle', 'guardian', 'headless_horseman']);
    readyEveryone(state);
    const witchView = stateForPlayer(state, 'p0');
    const otherView = stateForPlayer(state, 'p1');
    expect(witchView.prompt?.roleId).toBe('bog_witch');
    expect(otherView.prompt).toBeNull();
    expect(otherView.selfRole?.id).toBe('candlemaker');
    expect(otherView.revealedRoles).toBeNull();
    expect(otherView.players.every((player) => !('roleId' in player))).toBe(true);
  });
});

describe('night resolution', () => {
  it('runs first-night poison, automatic information, and Oracle choices in order', () => {
    const state = makeState(['bog_witch', 'candlemaker', 'oracle', 'guardian', 'headless_horseman']);
    readyEveryone(state);
    expect(state.phase).toBe('night');
    expect(state.nightActorId).toBe('p0');
    submitNightAction(state, 'p0', ['p1'], rng);
    expect(state.poisonedPlayerId).toBe('p1');
    expect(state.privateInfo.p1).toHaveLength(1);
    expect(state.nightActorId).toBe('p2');
    submitNightAction(state, 'p2', ['p1', 'p4'], rng);
    expect(state.privateInfo.p2).toHaveLength(1);
    expect(state.phase).toBe('day');
    expect(state.day).toBe(1);
    expect(state.players.every((player) => player.alive)).toBe(true);
  });

  it('lets the Guardian prevent the Demon’s kill', () => {
    const state = makeState(['guardian', 'candlemaker', 'headless_horseman', 'bog_witch', 'oracle'], 'day');
    state.night = 1;
    state.day = 1;
    beginNight(state, rng);
    submitNightAction(state, 'p3', ['p4'], rng);
    expect(state.nightActorId).toBe('p0');
    submitNightAction(state, 'p0', ['p1'], rng);
    expect(state.nightActorId).toBe('p4');
    submitNightAction(state, 'p4', ['p1', 'p2'], rng);
    expect(state.nightActorId).toBe('p2');
    submitNightAction(state, 'p2', ['p1'], rng);
    expect(state.players[1].alive).toBe(true);
    expect(state.nightDeaths).toEqual([]);
    expect(state.phase).toBe('day');
  });

  it('makes a poisoned Guardian’s ward fail', () => {
    const state = makeState(['guardian', 'candlemaker', 'headless_horseman', 'bog_witch', 'oracle'], 'day');
    state.night = 1;
    state.day = 1;
    beginNight(state, rng);
    submitNightAction(state, 'p3', ['p0'], rng);
    submitNightAction(state, 'p0', ['p1'], rng);
    expect(state.protectedPlayerId).toBeNull();
    submitNightAction(state, 'p4', ['p1', 'p2'], rng);
    submitNightAction(state, 'p2', ['p1'], rng);
    expect(state.players[1].alive).toBe(false);
  });

  it('skips disconnected night actors without revealing their roles', () => {
    const state = makeState(['bog_witch', 'candlemaker', 'oracle', 'guardian', 'headless_horseman']);
    readyEveryone(state);
    state.players[0].connected = false;
    reconcileAfterDisconnect(state, 'p0', rng);
    expect(state.poisonedPlayerId).toBeNull();
    expect(state.nightActorId).toBe('p2');
    state.players[2].connected = false;
    reconcileAfterDisconnect(state, 'p2', rng);
    expect(state.phase).toBe('day');
    expect(state.day).toBe(1);
  });

  it('passes the Demon role to a Minion on a self-kill', () => {
    const state = makeState(['headless_horseman', 'bog_witch', 'candlemaker', 'guardian', 'pumpkin_knight'], 'day');
    state.night = 1;
    state.day = 1;
    beginNight(state, rng);
    submitNightAction(state, 'p1', ['p2'], rng);
    expect(state.nightActorId).toBe('p3');
    submitNightAction(state, 'p3', ['p2'], rng);
    expect(state.nightActorId).toBe('p0');
    submitNightAction(state, 'p0', ['p0'], rng);
    expect(state.players[0].alive).toBe(false);
    expect(state.players[1].roleId).toBe('headless_horseman');
    expect(state.winner).toBeNull();
    expect(state.phase).toBe('day');
  });

  it('gives good the win when self-pass has no living Minion', () => {
    const state = makeState(['headless_horseman', 'bog_witch', 'candlemaker', 'guardian', 'pumpkin_knight'], 'day');
    state.players[1].alive = false;
    state.night = 1;
    state.day = 1;
    beginNight(state, rng);
    expect(state.nightActorId).toBe('p3');
    submitNightAction(state, 'p3', ['p2'], rng);
    expect(state.nightActorId).toBe('p0');
    submitNightAction(state, 'p0', ['p0'], rng);
    expect(state.winner).toBe('good');
  });
});

describe('day abilities and voting', () => {
  it('allows the Crimson Heir to inherit after a public Demon kill', () => {
    const state = makeState(['witch_hunter', 'headless_horseman', 'crimson_heir', 'candlemaker', 'guardian'], 'day');
    hunterShoot(state, 'p0', 'p1', rng);
    expect(state.players[1].alive).toBe(false);
    expect(state.players[2].roleId).toBe('headless_horseman');
    expect(state.winner).toBeNull();
  });

  it('advances to nominations when a Hunter death leaves every survivor ready', () => {
    const state = makeState(['witch_hunter', 'headless_horseman', 'crimson_heir', 'candlemaker', 'guardian'], 'day');
    for (const id of ['p0', 'p2', 'p3', 'p4']) markReady(state, id, rng);
    hunterShoot(state, 'p0', 'p1', rng);
    expect(state.players[2].roleId).toBe('headless_horseman');
    expect(state.phase).toBe('nominations');
  });

  it('ends in a good win when the Demon dies below the Heir threshold', () => {
    const state = makeState(['witch_hunter', 'headless_horseman', 'crimson_heir', 'candlemaker'], 'day');
    hunterShoot(state, 'p0', 'p1', rng);
    expect(state.winner).toBe('good');
    expect(state.players[2].roleId).toBe('crimson_heir');
  });

  it('executes the Doomed and awards evil the win', () => {
    const state = makeState(['doomed', 'headless_horseman', 'bog_witch', 'candlemaker', 'guardian'], 'day');
    readyEveryone(state);
    actOnNomination(state, 'p0', 'p0', rng);
    for (const player of state.players) castVote(state, player.id, true, rng);
    while (state.phase === 'nominations') {
      const nominator = currentNominator(state)!;
      actOnNomination(state, nominator.id, null, rng);
    }
    expect(state.players[0].alive).toBe(false);
    expect(state.winner).toBe('evil');
    expect(state.endReason).toContain('Doomed');
  });

  it('consumes a dead player’s ghost vote only when voting yes', () => {
    const state = makeState(['candlemaker', 'guardian', 'oracle', 'headless_horseman', 'bog_witch'], 'day');
    state.players[4].alive = false;
    readyEveryone(state);
    actOnNomination(state, 'p0', 'p1', rng);
    castVote(state, 'p4', true, rng);
    expect(state.players[4].ghostVoteUsed).toBe(false);
    expect(state.log.some((entry) => entry.text.includes('ghost vote'))).toBe(false);
    for (const player of state.players.filter((candidate) => candidate.alive)) castVote(state, player.id, false, rng);
    expect(state.activeVote).toBeNull();
    expect(state.players[4].ghostVoteUsed).toBe(true);
    expect(state.voteHistory[0].yesVotes).toBe(1);
  });

  it('counts yes votes from unused ghost votes toward the execution threshold', () => {
    const state = makeState(['candlemaker', 'guardian', 'oracle', 'headless_horseman', 'bog_witch'], 'day');
    state.players[0].alive = false;
    state.players[4].alive = false;
    readyEveryone(state);
    actOnNomination(state, 'p1', 'p2', rng);
    castVote(state, 'p1', true, rng);
    castVote(state, 'p2', true, rng);
    castVote(state, 'p3', false, rng);
    castVote(state, 'p0', true, rng);
    castVote(state, 'p4', false, rng);
    expect(state.voteHistory[0].yesVotes).toBe(3);
    expect(state.onBlock).toEqual({ playerId: 'p2', votes: 3 });
    expect(state.players[0].ghostVoteUsed).toBe(true);
    expect(state.players[4].ghostVoteUsed).toBe(false);
  });

  it('lets a working Mayor win with three alive and no execution', () => {
    const state = makeState(['harvest_mayor', 'headless_horseman', 'bog_witch', 'candlemaker', 'guardian'], 'day');
    state.players[3].alive = false;
    state.players[4].alive = false;
    readyEveryone(state);
    while (state.phase === 'nominations') {
      const nominator = currentNominator(state)!;
      actOnNomination(state, nominator.id, null, rng);
    }
    expect(state.winner).toBe('good');
    expect(state.endReason).toContain('Mayor');
  });

  it('skips a disconnected player’s nomination turn', () => {
    const state = makeState(['candlemaker', 'guardian', 'oracle', 'headless_horseman', 'bog_witch'], 'day');
    readyEveryone(state);
    state.players[0].connected = false;
    reconcileAfterDisconnect(state, 'p0', rng);
    expect(currentNominator(state)?.id).toBe('p1');
    expect(state.log.some((entry) => entry.text === 'Player 0 withholds their nomination.')).toBe(true);
  });

  it('skips a player who disconnected before nominations began', () => {
    const state = makeState(['candlemaker', 'guardian', 'oracle', 'headless_horseman', 'bog_witch'], 'day');
    state.players[0].connected = false;
    for (const player of state.players.slice(1)) markReady(state, player.id, rng);
    expect(state.phase).toBe('nominations');
    expect(currentNominator(state)?.id).toBe('p1');
  });

  it('closes a ballot when all remaining connected voters have acted', () => {
    const state = makeState(['candlemaker', 'guardian', 'oracle', 'headless_horseman', 'bog_witch'], 'day');
    readyEveryone(state);
    actOnNomination(state, 'p0', 'p1', rng);
    castVote(state, 'p0', true, rng);
    castVote(state, 'p2', true, rng);
    castVote(state, 'p3', false, rng);
    castVote(state, 'p4', false, rng);
    state.players[1].connected = false;
    reconcileAfterDisconnect(state, 'p1', rng);
    expect(state.voteHistory).toHaveLength(1);
    expect(state.activeVote).toBeNull();
    expect(currentNominator(state)?.id).toBe('p2');
  });

  it('does not wait for a voter who was already disconnected when the ballot opened', () => {
    const state = makeState(['candlemaker', 'guardian', 'oracle', 'headless_horseman', 'bog_witch'], 'day');
    state.players[1].connected = false;
    for (const player of state.players.filter((candidate) => candidate.connected)) markReady(state, player.id, rng);
    actOnNomination(state, 'p0', 'p1', rng);
    for (const id of ['p0', 'p2', 'p3', 'p4']) castVote(state, id, false, rng);
    expect(state.voteHistory).toHaveLength(1);
    expect(state.activeVote).toBeNull();
  });
});
