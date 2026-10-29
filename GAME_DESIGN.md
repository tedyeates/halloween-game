# Hollowbrook — Game Design

## Premise

On Halloween, the Headless Horseman rides into the village of Hollowbrook. The good players must identify and kill the Demon before evil reduces the town to two survivors. Every player has a secret role, but nobody needs to moderate: the application supplies the night prompts, information, and public narration.

## Design goals

1. **No narrator, no hidden manual work.** The server owns the complete game state and only sends each player what they may know.
2. **Conversation remains human.** The app automates rules, not discussion, accusations, or deception.
3. **A readable first script.** Roles use beginner-friendly information, protection, poisoning, and Demon-passing mechanics without requiring arbitrary storyteller decisions.
4. **Short online sessions.** Ordered nomination turns and automatic phase changes prevent a room from stalling.

## Player composition

Every game has one Headless Horseman and one Minion. Other roles are selected randomly from the script.

| Players | Townsfolk | Outsiders | Minions | Demon |
| --- | ---: | ---: | ---: | ---: |
| 5 | 3 | 0 | 1 | 1 |
| 6 | 3 | 1 | 1 | 1 |
| 7 | 5 | 0 | 1 | 1 |
| 8 | 5 | 1 | 1 | 1 |

The Minion learns the Demon. The Demon learns its Minion and three good roles not in play to use as bluffs. All roles are unique.

## Game flow

1. **Gathering:** Players join using a room code. The host starts with 5–8 players.
2. **Role reveal:** Players privately inspect their role and ready up.
3. **Night:** The app wakes only roles with an action or information. Choices and results are private.
4. **Discussion:** At dawn, deaths are announced without revealing roles. Living players ready up when conversation is finished.
5. **Nominations:** Each living player, in seating order, may nominate one living player or pass. A player cannot be nominated twice in one day.
6. **Ballot:** All eligible players vote simultaneously and secretly. Living players always retain a vote. Each dead player may vote yes once for the rest of the game; this consumes their ghost vote.
7. **Execution:** A nomination needs at least half the living players, rounded up. It must exceed the previous marked vote to replace it. An equal highest vote clears the mark. After all nomination turns, the marked player is executed.
8. **Next night or victory:** The app resolves end-of-day abilities and either begins the next night or reveals all roles.

### Victory

- Good wins when the Demon dies without a successor.
- Evil wins when only two players remain alive.
- Executing a working Doomed player immediately awards evil the win.
- If exactly three players are alive and no execution occurs, a living working Harvest Mayor awards good the win.

## Role script

### Townsfolk

- **Candlemaker:** On the first night, learn that one of two players is a particular Townsfolk role.
- **Occultist:** On the first night, learn that one of two players is a particular Minion role.
- **Coven Cook:** On the first night, learn how many adjacent pairs of players register as evil.
- **Ghost Whisperer:** Each night, learn how many of your two nearest living neighbors register as evil.
- **Oracle:** Each night, choose two players and learn whether either registers as the Demon. One good player is secretly chosen as a permanent false positive.
- **Gravedigger:** Each night after the first, learn the role of the player executed yesterday. The app does not wake this role if yesterday had no execution.
- **Guardian:** Each night after the first, choose another living player. They cannot be killed by the Demon tonight.
- **Pumpkin Knight:** You cannot be killed by the Demon while your ability is working.
- **Witch Hunter:** Once per game during open discussion, publicly choose a living player. If they are the Demon and your ability is working, they die.
- **Harvest Mayor:** If no execution occurs with exactly three players alive and your ability is working, good wins.

### Outsiders

- **Poltergeist:** You register as evil and as a Demon to abilities while your ability is working, despite being good.
- **The Doomed:** If you die by execution while your ability is working, evil wins immediately.

### Minions

- **Bog Witch:** Each night, choose a living player to poison until the next night. Their information becomes arbitrary and their active and passive abilities do not work normally. A poisoned Oracle still chooses and receives an answer, but it is not reliable.
- **Crimson Heir:** If the Demon dies while at least five players were alive immediately before that death and your ability is working, you become the Headless Horseman.

### Demon

- **Headless Horseman:** Each night after the first, choose a living player to kill. A Guardian's ward or a working Pumpkin Knight prevents the death. Choosing yourself kills you and passes the Demon role to a random living Minion; if none exists, good wins.

## Night order

**First night:** Bog Witch → Occultist → Candlemaker → Coven Cook → Ghost Whisperer → Oracle.

**Later nights:** Bog Witch → Guardian → Ghost Whisperer → Oracle → Gravedigger → Headless Horseman.

The order is enforced by the server. Other players receive a neutral waiting screen rather than the current actor's identity. Previous poison expires at the start of each new night, before the Bog Witch acts.

## Automated narration

Public announcements use prewritten, state-aware templates in `src/shared/statements.ts`. They cover nightfall, quiet or deadly dawns, nominations, vote totals, execution, ghost votes, the Witch Hunter, and victory. Templates insert only public facts such as names, night numbers, and vote totals; secret roles and night targets are never added to the public chronicle.

## Human Storyteller mode

The room creator can choose a human Storyteller when creating the room. The Storyteller is a separate host seat and does not receive a character, leaving the normal 5–8 seats for players.

### Setup

The app suggests a legal composition for the current player count and three legal Demon bluffs. The Storyteller can reroll the suggestion or replace individual roles with unused roles from the same pool. Validation prevents duplicate roles, wrong role counts, an incorrect Demon, and illegal bluffs. Balance notes warn about missing information, missing protection, a lone information role, and other extreme compositions.

### Private pauses

The game automatically pauses for:

1. **Private role delivery.** Every player is on the required visit list. The Storyteller tells each player their role, ability, evil teammates, or Demon bluffs.
2. **Every night.** Players with secret choices choose on their own devices as the pause begins. Their choices and optional narration requests appear on the Storyteller’s screen. Once all required choices arrive, the app calculates outcomes and shows the Storyteller the private facts and poisoned-information warnings.

The Storyteller is explicitly instructed to visit **everyone**, not only the required list, so the pattern of private conversations does not expose active roles. Only required conversations appear on the checklist. The pause cannot end until every required visit is marked complete, the Storyteller confirms they visited everyone, and all required secret actions have been submitted.

Player results are **voice-only**: the app never puts private results or private information in the player’s screen during Storyteller mode. The player’s role card appears after the Storyteller marks their role-delivery visit complete. A dead player’s role change is applied when the night pause is committed.

### Day phase

Once the Storyteller announces dawn, the app resumes normal play. Players handle readiness, nominations, simultaneous secret ballots, executions, and ghost votes through the same automated flow as a standard game. The Storyteller observes from a separate dashboard with the full grimoire.

### Guidance without arbitrary overrides

The app remains the authority on outcomes. The Storyteller cannot edit roles, deaths, poison, targets, or votes. The Storyteller receives facts, false-information warnings, public outcomes, and legal action prompts, then decides how to phrase them and how to perform the visit.

## Current rule adaptations

Hollowbrook preserves the core hidden-role, information, nomination, execution, ghost-vote, and Demon-hunt structure while making moderation deterministic:

- Nominations use seating-order turns instead of an open-ended real-time nomination floor.
- Ballots are simultaneous and secret until closed.
- The Poltergeist consistently registers as evil/Demon rather than relying on a narrator's choice.
- Poisoned information is generated as a plausible automated result rather than a narrator-selected lie.
- Disconnected players do not stall a room: they are excluded from ready checks, their night and nomination turns are skipped, and ballots close once all connected eligible voters have acted. Their seat and private information remain available when they reconnect; the room pauses if everyone disconnects.
- Roles target living players except the Oracle, who may inspect any two players.
- No Travellers, custom scripts, mid-game joins, or player-created roles are included in this first version.
