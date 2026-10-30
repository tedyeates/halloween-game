import { describe, expect, it } from 'vitest';
import { actOnNomination, createGameState, currentNominator, markReady } from './engine.js';
import {
  finishNarratorPause,
  handlePlayerDeparture,
  markNarratorVisit,
  narratorPauseCanFinish,
  setNarratorAllVisited,
  setNarratorSetup,
  startNarratorGame,
  submitNarratorAction,
  syncNarratorSetup,
} from './narrator.js';
import { stateForPlayer, stateForStoryteller } from './sanitize.js';
import type { GameState, RoleId } from './types.js';

const rng = () => 0.42;

function makeNarratorState(): GameState {
  const state = createGameState('STORY', 'storyteller', 'storyteller');
  state.players = Array.from({ length: 5 }, (_, index) => ({
    id: `p${index}`,
    name: `Player ${index}`,
    alive: true,
    connected: true,
    ghostVoteUsed: false,
    abilityUsed: false,
  }));
  syncNarratorSetup(state, rng);
  const roles: RoleId[] = ['candlemaker', 'oracle', 'ghost_whisperer', 'bog_witch', 'headless_horseman'];
  setNarratorSetup(state, {
    roles,
    bluffs: ['coven_cook', 'guardian', 'witch_hunter'],
  });
  return state;
}

function playerIdFor(state: GameState, roleId: RoleId): string {
  return state.players.find((player) => player.roleId === roleId)!.id;
}

function completeVisits(state: GameState): void {
  const storytellerView = stateForStoryteller(state);
  for (const visit of storytellerView.pause?.visits ?? []) {
    if (!visit.done) markNarratorVisit(state, visit.playerId, true);
  }
  setNarratorAllVisited(state, true);
}

describe('Storyteller mode', () => {
  it('shows roles immediately without a required role-delivery visit', () => {
    const state = makeNarratorState();
    startNarratorGame(state, 'storyteller', rng);
    expect(state.phase).toBe('roleReveal');
    expect(state.players.every((player) => player.roleId)).toBe(true);
    expect(state.narrator?.kind).toBe('roles');
    expect(state.narrator?.visits).toHaveLength(0);
    expect(stateForPlayer(state, state.players[0].id).selfRole?.id).toBe(state.players[0].roleId);
    expect(stateForPlayer(state, state.players[0].id).privateInfo).toEqual([]);
    const view = stateForStoryteller(state);
    expect(view.pause?.visits).toHaveLength(0);
    expect(view.players.every((player) => player.roleId)).toBe(true);
  });

  it('shows the evil team immediately to the Demon and Minion only', () => {
    const state = makeNarratorState();
    startNarratorGame(state, 'storyteller', rng);
    const minionId = playerIdFor(state, 'bog_witch');
    const demonId = playerIdFor(state, 'headless_horseman');
    const goodId = playerIdFor(state, 'oracle');

    expect(stateForPlayer(state, minionId).evilTeam?.demon?.id).toBe(demonId);
    expect(stateForPlayer(state, demonId).evilTeam?.minions[0].id).toBe(minionId);
    expect(stateForPlayer(state, goodId).evilTeam).toBeNull();
  });

  it('can begin the first night without any role-delivery visits', () => {
    const state = makeNarratorState();
    startNarratorGame(state, 'storyteller', rng);
    expect(narratorPauseCanFinish(state)).toBe(true);
    finishNarratorPause(state, rng);
    expect(state.phase).toBe('night');
    expect(state.night).toBe(1);
    expect(state.narrator?.kind).toBe('night');
    expect(state.players.every((player) => stateForPlayer(state, player.id).selfRole)).toBe(true);
  });

  it('collects all actions, generates private facts, and reveals nothing automatically to players', () => {
    const state = makeNarratorState();
    startNarratorGame(state, 'storyteller', rng);
    completeVisits(state);
    finishNarratorPause(state, rng);

    const candleId = playerIdFor(state, 'candlemaker');
    const oracleId = playerIdFor(state, 'oracle');
    const ghostId = playerIdFor(state, 'ghost_whisperer');
    const witchId = playerIdFor(state, 'bog_witch');
    const demonId = playerIdFor(state, 'headless_horseman');
    expect(state.narrator?.actions.map((action) => action.playerId).sort()).toEqual([witchId, oracleId].sort());
    expect(state.narrator?.actions.find((action) => action.playerId === oracleId)?.targetPlayerIds).not.toContain(oracleId);
    expect(state.redHerringId).not.toBe(oracleId);

    submitNarratorAction(state, witchId, [candleId], 'Make the candle-maker’s clue feel unsettling.', rng);
    expect(state.narrator?.resolved).toBe(false);
    submitNarratorAction(state, oracleId, [candleId, demonId], '', rng);
    expect(state.narrator?.resolved).toBe(true);
    expect(state.narrator?.facts.some((fact) => fact.playerId === candleId && fact.isFalse)).toBe(true);
    expect(state.narrator?.facts.some((fact) => fact.playerId === oracleId)).toBe(true);
    expect(state.narrator?.facts.some((fact) => fact.playerId === ghostId)).toBe(true);
    const candleFact = state.narrator?.facts.find((fact) => fact.playerId === candleId);
    expect(candleFact?.text).not.toContain(state.players.find((player) => player.id === candleId)!.name);
    expect(candleFact?.text).not.toContain('Candlemaker');
    expect(stateForPlayer(state, candleId).privateInfo).toEqual([]);
    expect(stateForPlayer(state, candleId).narrator?.actionNote).toBe('');

    const storytellerView = stateForStoryteller(state);
    expect(storytellerView.pause?.facts.some((fact) => fact.hint.includes('Poisoned'))).toBe(true);
    expect(storytellerView.pause?.actions.find((action) => action.playerId === witchId)?.note).toContain('unsettling');

    completeVisits(state);
    expect(narratorPauseCanFinish(state)).toBe(true);
    finishNarratorPause(state, rng);
    expect(state.phase).toBe('day');
    expect(state.narrator).toBeNull();
    expect(state.log.some((entry) => entry.text.includes('Dawn'))).toBe(true);
    expect(stateForPlayer(state, candleId).privateInfo).toEqual([]);
  });

  it('returns to a Storyteller night pause after an execution-free day', () => {
    const state = makeNarratorState();
    startNarratorGame(state, 'storyteller', rng);
    completeVisits(state);
    finishNarratorPause(state, rng);
    const oracleId = playerIdFor(state, 'oracle');
    const witchId = playerIdFor(state, 'bog_witch');
    submitNarratorAction(state, witchId, [playerIdFor(state, 'ghost_whisperer')], '', rng);
    submitNarratorAction(state, oracleId, [playerIdFor(state, 'candlemaker'), playerIdFor(state, 'headless_horseman')], '', rng);
    completeVisits(state);
    finishNarratorPause(state, rng);
    expect(state.phase).toBe('day');

    for (const player of state.players.filter((candidate) => candidate.alive)) {
      markReady(state, player.id, rng);
    }
    expect(state.phase).toBe('nominations');
    while (state.phase === 'nominations') {
      actOnNomination(state, currentNominator(state)!.id, null, rng);
    }
    expect(state.phase).toBe('night');
    expect(state.night).toBe(2);
    expect(state.narrator?.kind).toBe('night');
    expect(state.narrator?.actions.map((action) => action.playerId)).toContain(playerIdFor(state, 'headless_horseman'));
  });

  it('counts an automated Demon leaving as a suicide and passes to the Heir at five alive', () => {
    const state = createGameState('AUTO', 'p0', 'automated');
    state.phase = 'day';
    state.players = (['headless_horseman', 'crimson_heir', 'candlemaker', 'guardian', 'oracle'] as RoleId[]).map((roleId, index) => ({
      id: `p${index}`,
      name: `Player ${index}`,
      roleId,
      alive: true,
      connected: true,
      ghostVoteUsed: false,
      abilityUsed: false,
    }));
    handlePlayerDeparture(state, 'p0', rng);
    expect(state.players[0].alive).toBe(false);
    expect(state.players[1].roleId).toBe('headless_horseman');
    expect(state.phase).toBe('day');
    expect(state.log.some((entry) => entry.text.includes('suicide'))).toBe(true);
  });

  it('awards good the win when the Demon leaves below the Heir threshold', () => {
    const state = createGameState('AUTO', 'p0', 'automated');
    state.phase = 'day';
    state.players = (['headless_horseman', 'crimson_heir', 'candlemaker', 'guardian', 'oracle'] as RoleId[]).map((roleId, index) => ({
      id: `p${index}`,
      name: `Player ${index}`,
      roleId,
      alive: true,
      connected: true,
      ghostVoteUsed: false,
      abilityUsed: false,
    }));
    state.players[4].alive = false;
    handlePlayerDeparture(state, 'p0', rng);
    expect(state.winner).toBe('good');
    expect(state.phase).toBe('gameOver');
    expect(state.log.some((entry) => entry.text.includes('suicide'))).toBe(true);
  });

  it('queues a Storyteller-mode departure without breaking the active night pause', () => {
    const state = makeNarratorState();
    startNarratorGame(state, 'storyteller', rng);
    finishNarratorPause(state, rng);
    const oracleId = playerIdFor(state, 'oracle');
    const witchId = playerIdFor(state, 'bog_witch');
    handlePlayerDeparture(state, oracleId, rng);
    expect(state.narrator?.departures).toContain(oracleId);
    expect(state.narrator?.actions.some((action) => action.playerId === oracleId)).toBe(false);
    expect(state.players.find((player) => player.id === oracleId)?.alive).toBe(true);

    submitNarratorAction(state, witchId, [playerIdFor(state, 'candlemaker')], '', rng);
    completeVisits(state);
    finishNarratorPause(state, rng);
    expect(state.players.find((player) => player.id === oracleId)?.alive).toBe(false);
    expect(state.log.some((entry) => entry.text.includes('suicide'))).toBe(true);
  });

  it('rejects illegal setups and duplicate roles', () => {
    const state = makeNarratorState();
    expect(() => setNarratorSetup(state, {
      roles: ['candlemaker', 'candlemaker', 'oracle', 'bog_witch', 'headless_horseman'],
      bluffs: ['coven_cook', 'guardian', 'witch_hunter'],
    })).toThrow(/only once/);
    expect(() => setNarratorSetup(state, {
      roles: ['candlemaker', 'oracle', 'ghost_whisperer', 'bog_witch', 'headless_horseman'],
      bluffs: ['coven_cook', 'guardian', 'oracle'],
    })).toThrow(/not in play/);
  });
});
