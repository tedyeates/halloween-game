import { MINIONS, OUTSIDERS, ROLES, TOWNSFOLK } from './roles.js';
import type { NarratorSetup, RoleCategory, RoleId } from './types.js';
import { pick, shuffle, type Random } from './engineUtils.js';

export const SETUP_COUNTS: Record<number, { townsfolk: number; outsiders: number }> = {
  5: { townsfolk: 3, outsiders: 0 },
  6: { townsfolk: 3, outsiders: 1 },
  7: { townsfolk: 5, outsiders: 0 },
  8: { townsfolk: 5, outsiders: 1 },
};

export function suggestSetup(playerCount: number, rng: Random): NarratorSetup {
  const counts = SETUP_COUNTS[playerCount];
  if (!counts) throw new Error('Hollowbrook requires 5–8 players.');
  const roles: RoleId[] = [
    ...shuffle(TOWNSFOLK, rng).slice(0, counts.townsfolk).map((role) => role.id),
    ...shuffle(OUTSIDERS, rng).slice(0, counts.outsiders).map((role) => role.id),
    pick(MINIONS, rng).id,
    'headless_horseman',
  ];
  return { roles, bluffs: suggestBluffs(roles, rng) };
}

export function suggestBluffs(roles: RoleId[], rng: Random): RoleId[] {
  return shuffle([...TOWNSFOLK, ...OUTSIDERS], rng)
    .filter((role) => !roles.includes(role.id))
    .slice(0, 3)
    .map((role) => role.id);
}

export function validateSetup(playerCount: number, setup: NarratorSetup): void {
  const counts = SETUP_COUNTS[playerCount];
  if (!counts) throw new Error('Hollowbrook requires 5–8 players.');
  if (!Array.isArray(setup.roles) || !Array.isArray(setup.bluffs)) throw new Error('The setup is incomplete.');
  if (new Set(setup.roles).size !== setup.roles.length) throw new Error('Each role can appear only once.');
  if (setup.roles.length !== playerCount) throw new Error(`Choose exactly ${playerCount} roles for ${playerCount} players.`);

  const count = (category: RoleCategory) => setup.roles.filter((roleId) => ROLES[roleId]?.category === category).length;
  if (count('townsfolk') !== counts.townsfolk) throw new Error(`Choose exactly ${counts.townsfolk} Townsfolk.`);
  if (count('outsider') !== counts.outsiders) throw new Error(`Choose exactly ${counts.outsiders} ${counts.outsiders === 1 ? 'Outsider' : 'Outsiders'}.`);
  if (count('minion') !== 1) throw new Error('Choose exactly one Minion.');
  if (count('demon') !== 1 || !setup.roles.includes('headless_horseman')) throw new Error('The Headless Horseman must be the Demon.');
  if (setup.bluffs.length !== 3 || new Set(setup.bluffs).size !== 3) throw new Error('Choose exactly three different Demon bluffs.');
  if (setup.bluffs.some((roleId) => !ROLES[roleId] || ROLES[roleId].team !== 'good' || setup.roles.includes(roleId))) {
    throw new Error('Demon bluffs must be three good roles that are not in play.');
  }
}

export function setupGuidance(setup: NarratorSetup): string[] {
  const selected = setup.roles.map((roleId) => ROLES[roleId]);
  const notes: string[] = [];
  const informationRoles = selected.filter((role) => [
    'candlemaker', 'occultist', 'coven_cook', 'ghost_whisperer', 'oracle', 'gravedigger',
  ].includes(role.id));
  const protectionRoles = selected.filter((role) => ['guardian', 'pumpkin_knight'].includes(role.id));
  const firstNightRoles = selected.filter((role) => ['candlemaker', 'occultist', 'coven_cook', 'oracle', 'ghost_whisperer'].includes(role.id));

  if (informationRoles.length === 0) notes.push('No information roles: the town will have very little to work with. Add at least one.');
  else if (informationRoles.length === 1) notes.push('Only one information role: consider adding another to give the good team conflicting or supporting clues.');
  else notes.push(`${informationRoles.length} information roles give the town several clues to compare.`);

  if (firstNightRoles.length === 0) notes.push('No first-night information: night one will be mostly silent.');
  if (protectionRoles.length === 0) notes.push('No protection roles: the Demon can kill freely every night.');
  if (selected.some((role) => role.id === 'bog_witch') && informationRoles.length === 0) notes.push('The Bog Witch has little to poison without information roles.');
  if (selected.some((role) => role.id === 'crimson_heir') && protectionRoles.length === 0) notes.push('The Crimson Heir may make the Demon hard to finish; this is a more evil-favoured setup.');
  if (selected.some((role) => role.id === 'doomed')) notes.push('The Doomed makes executing an Outsider especially dangerous. Explain this carefully.');
  return notes;
}
