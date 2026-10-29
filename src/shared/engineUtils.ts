import { ROLES } from './roles.js';
import { STATEMENTS } from './statements.js';
import type { GameState, Player, RoleId, Team } from './types.js';

export type Random = () => number;

export function randomId(rng: Random): string {
  return Math.floor(rng() * 0xffffffff).toString(36).padStart(6, '0') + Date.now().toString(36).slice(-4);
}

export function pick<T>(items: T[], rng: Random): T {
  if (items.length === 0) throw new Error('Cannot pick from an empty list.');
  return items[Math.floor(rng() * items.length)];
}

export function shuffle<T>(items: T[], rng: Random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(rng() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function getPlayer(state: GameState, playerId: string): Player {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error('Player not found.');
  return player;
}

export function livingPlayers(state: GameState): Player[] {
  return state.players.filter((player) => player.alive);
}

export function addLog(state: GameState, text: string, kind: 'story' | 'death' | 'vote' | 'system' = 'story', rng: Random = Math.random): void {
  state.log.push({ id: randomId(rng), text, kind });
  if (state.log.length > 100) state.log.shift();
}

export function addInfo(
  state: GameState,
  playerId: string,
  text: string,
  rng: Random,
  details: { isFalse?: boolean; source?: 'ability' | 'succession' } = {},
): void {
  state.privateInfo[playerId] ??= [];
  state.privateInfo[playerId].push({
    id: randomId(rng),
    text,
    night: state.night,
    day: state.day,
    isFalse: details.isFalse,
    source: details.source ?? 'ability',
  });
}

export function isAbilityWorking(state: GameState, player: Player): boolean {
  return state.poisonedPlayerId !== player.id;
}

export function registersEvil(state: GameState, player: Player): boolean {
  if (!player.roleId) return false;
  if (ROLES[player.roleId].team === 'evil') return true;
  return player.roleId === 'poltergeist' && isAbilityWorking(state, player);
}

export function registersDemon(state: GameState, player: Player): boolean {
  return player.roleId === 'headless_horseman' || (player.roleId === 'poltergeist' && isAbilityWorking(state, player));
}

export function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
}

export function finishGame(state: GameState, winner: Team, reason: string, rng: Random): void {
  state.winner = winner;
  state.endReason = reason;
  state.phase = 'gameOver';
  state.nightActorId = null;
  state.activeVote = null;
  addLog(state, reason, 'system', rng);
}

export function killPlayer(
  state: GameState,
  playerId: string,
  cause: 'demon' | 'demonSelf' | 'execution' | 'hunter',
  rng: Random,
): boolean {
  const player = getPlayer(state, playerId);
  if (!player.alive) return false;
  const aliveBefore = livingPlayers(state).length;
  player.alive = false;

  if (player.roleId === 'headless_horseman') {
    const livingMinions = livingPlayers(state).filter((candidate) => candidate.roleId && ROLES[candidate.roleId].category === 'minion');
    let successor: Player | undefined;

    if (cause === 'demonSelf' && livingMinions.length > 0) {
      successor = pick(livingMinions, rng);
    } else if (cause !== 'demonSelf' && aliveBefore >= 5) {
      successor = livingMinions.find((candidate) => candidate.roleId === 'crimson_heir' && isAbilityWorking(state, candidate));
    }

    if (successor) {
      successor.roleId = 'headless_horseman';
      addInfo(state, successor.id, 'The Horseman’s curse passes to you. You are now the Headless Horseman.', rng, { source: 'succession' });
    } else {
      finishGame(state, 'good', STATEMENTS.goodWins, rng);
    }
    return true;
  }

  if (livingPlayers(state).length <= 2) {
    finishGame(state, 'evil', STATEMENTS.evilWins, rng);
  }
  return true;
}

export function assertRole(player: Player, roleId: RoleId): void {
  if (player.roleId !== roleId) throw new Error('Your role cannot do that.');
}
