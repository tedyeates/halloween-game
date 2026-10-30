import { useEffect, useState } from 'react';
import { api } from '../api';
import type { ActionResult, ClientState } from '../../shared/types.js';
import TargetPicker from './TargetPicker';

interface ActionPanelProps {
  state: ClientState;
  run: (action: () => Promise<ActionResult>) => Promise<boolean>;
  busy: boolean;
}

export default function ActionPanel({ state, run, busy }: ActionPanelProps) {
  if (state.narrator) return <StorytellerPause state={state} run={run} busy={busy} />;
  if (state.phase === 'roleReveal') return <RoleReveal state={state} run={run} busy={busy} />;
  if (state.phase === 'night') return <NightAction state={state} run={run} busy={busy} />;
  if (state.phase === 'day') return <DayAction state={state} run={run} busy={busy} />;
  if (state.phase === 'nominations') return <NominationAction state={state} run={run} busy={busy} />;
  return null;
}

function StorytellerPause({ state, run, busy }: ActionPanelProps) {
  const narrator = state.narrator!;
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const action = narrator.action;

  useEffect(() => {
    setSelected([]);
    setNote('');
  }, [state.night, action?.title]);

  if (narrator.pause === 'roles') {
    return (
      <section className="action-panel story-waiting">
        <div className="story-moon" aria-hidden="true">☾</div>
        <p className="eyebrow-text">Read your secret role</p>
        <h2>Your role is on your screen</h2>
        <p>Read your ability carefully and keep it private. The Storyteller may speak with you at their discretion during this pause; the first night begins when they are ready.</p>
        <div className="waiting-host"><span className="pulse-dot" /> Do not reveal what you have seen yet.</div>
      </section>
    );
  }

  if (!action) {
    return (
      <section className="action-panel story-waiting">
        <div className="story-moon" aria-hidden="true">☾</div>
        <p className="eyebrow-text">Night {state.night} · Private pause</p>
        <h2>The Storyteller will visit shortly</h2>
        <p>Keep your device close and your secrets closer. The night continues when every required conversation is complete.</p>
      </section>
    );
  }

  if (action && !narrator.actionSubmitted) {
    const roleName = state.selfRole?.name ?? 'night role';
    return (
      <section className="action-panel night-action story-action">
        <p className="eyebrow-text">Your night action · {roleName}</p>
        <h2>{action.title}</h2>
        <p>{action.description}</p>
        <TargetPicker players={state.players} eligibleIds={action.targetPlayerIds} selected={selected} count={action.selectionCount} onChange={setSelected} disabled={busy} />
        <label className="story-note-label" htmlFor="story-note">Message for the Storyteller <span>optional</span></label>
        <textarea id="story-note" className="story-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={240} placeholder="How would you like this action described, or anything they should know?" />
        <button className="primary-button" disabled={selected.length !== action.selectionCount || busy} onClick={() => void run(() => api.nightAct(selected, note))}>Send choice to Storyteller<span>→</span></button>
        <p className="form-hint">Your choice is private. The Storyteller will discuss it with you before revealing the outcome.</p>
      </section>
    );
  }

  const chosen = action.selectedTargetIds
    .map((id) => state.players.find((player) => player.id === id)?.name)
    .filter(Boolean)
    .join(' and ');
  return (
    <section className="action-panel story-waiting">
      <div className="story-moon" aria-hidden="true">☾</div>
      <p className="eyebrow-text">Choice received</p>
      <h2>Your action is with the Storyteller</h2>
      <p>You chose <strong>{chosen}</strong>. Discuss how you want it revealed when they visit. Nothing is public until they announce it.</p>
      {narrator.actionNote && <blockquote className="sent-note">“{narrator.actionNote}”</blockquote>}
      <div className="waiting-host"><span className="pulse-dot" /> Leaving the outcome in the Storyteller’s hands.</div>
    </section>
  );
}

function RoleReveal({ state, run, busy }: ActionPanelProps) {
  const ready = state.readyPlayerIds.includes(state.selfId);
  return (
    <section className="action-panel">
      <p className="eyebrow-text">The curse is cast</p>
      <h2>Learn your role. Keep it secret.</h2>
      <p>Your role card and private notes contain everything you need. When everyone is ready, the first night begins automatically.</p>
      <button className="primary-button" onClick={() => void run(api.ready)} disabled={ready || busy}>{ready ? 'You are ready' : 'I know my role'}<span>{ready ? '✓' : '→'}</span></button>
      <div className="ready-progress"><span>{state.readyPlayerIds.length} of {state.players.length} ready</span><div><i style={{ width: `${state.readyPlayerIds.length / state.players.length * 100}%` }} /></div></div>
    </section>
  );
}

function NightAction({ state, run, busy }: ActionPanelProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const prompt = state.prompt;
  useEffect(() => setSelected([]), [state.night, prompt?.title]);
  if (!prompt) {
    return (
      <section className="action-panel night-waiting">
        <div className="sleep-icon" aria-hidden="true">☾</div>
        <p className="eyebrow-text">Night {state.night}</p>
        <h2>Hollowbrook sleeps…</h2>
        <p>The app is resolving secret abilities. You will be notified here if you need to act.</p>
        <div className="waiting-host"><span className="pulse-dot" /> Keep your device close and your secrets closer.</div>
      </section>
    );
  }
  return (
    <section className="action-panel night-action">
      <p className="eyebrow-text">Your night action · {prompt.roleId.replaceAll('_', ' ')}</p>
      <h2>{prompt.title}</h2><p>{prompt.description}</p>
      <TargetPicker players={state.players} eligibleIds={prompt.targetPlayerIds} selected={selected} count={prompt.selectionCount} onChange={setSelected} disabled={busy} />
      <button className="primary-button" disabled={selected.length !== prompt.selectionCount || busy} onClick={() => void run(() => api.nightAct(selected))}>{prompt.confirmLabel}<span>→</span></button>
      <p className="form-hint">Your choice is private. The night advances after you confirm.</p>
    </section>
  );
}

function DayAction({ state, run, busy }: ActionPanelProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const me = state.players.find((player) => player.id === state.selfId)!;
  const ready = state.readyPlayerIds.includes(state.selfId);
  const canShoot = me.alive && state.selfRole?.id === 'witch_hunter' && !me.abilityUsed;
  const living = state.players.filter((player) => player.alive);
  return (
    <section className="action-panel">
      <p className="eyebrow-text">Day {state.day} · Open discussion</p>
      <h2>Who is hiding behind a mask?</h2>
      <p>Speak freely. When every living player is ready, each will get one nomination turn.</p>
      {canShoot && (
        <div className="hunter-rite">
          <h3>🏹 Invoke your Witch Hunter’s rite <span>Once per game</span></h3>
          <p>Choose a living target. This is public and cannot be undone.</p>
          <TargetPicker players={living} eligibleIds={living.map((player) => player.id)} selected={selected} count={1} onChange={setSelected} disabled={busy} compact />
          <button className="danger-button" disabled={selected.length !== 1 || busy} onClick={() => void run(() => api.hunterShoot(selected[0]))}>Fire at {selected.length ? state.players.find((player) => player.id === selected[0])?.name : 'selected player'}</button>
        </div>
      )}
      {me.alive ? (
        <button className="primary-button" onClick={() => void run(api.ready)} disabled={ready || busy}>{ready ? 'Ready for nominations' : 'Ready to nominate'}<span>{ready ? '✓' : '→'}</span></button>
      ) : <p className="dead-note">You are dead, but may still speak and use your ghost vote.</p>}
      <div className="ready-progress"><span>{state.readyPlayerIds.length} of {living.length} living players ready</span><div><i style={{ width: `${living.length ? state.readyPlayerIds.length / living.length * 100 : 0}%` }} /></div></div>
    </section>
  );
}

function NominationAction({ state, run, busy }: ActionPanelProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const current = state.players.find((player) => player.id === state.currentNominatorId);
  useEffect(() => setSelected([]), [state.currentNominatorId, state.activeVote?.nomineeId]);
  const ballot = state.activeVote;
  if (ballot) {
    const nominee = state.players.find((player) => player.id === ballot.nomineeId)!;
    const nominator = state.players.find((player) => player.id === ballot.nominatorId)!;
    const me = state.players.find((player) => player.id === state.selfId)!;
    const livingCount = state.players.filter((player) => player.alive).length;
    const yesNeeded = Math.ceil(livingCount / 2);
    const unusedGhostVotes = state.players.filter((player) => !player.alive && !player.ghostVoteUsed).length;
    const isDead = !me.alive;
    return (
      <section className="action-panel vote-panel">
        <p className="eyebrow-text">The town must decide</p><h2>Vote on {nominee.name}</h2>
        <p>Nominated by {nominator.name}. <strong>{yesNeeded} yes {yesNeeded === 1 ? 'vote is' : 'votes are'} required</strong>—at least half of the {livingCount} living players. Living votes and unused ghost votes both count.</p>
        <div className="vote-guidance">
          <span><strong>{livingCount}</strong> living voters</span>
          <span><strong>{unusedGhostVotes}</strong> unused ghost {unusedGhostVotes === 1 ? 'vote' : 'votes'}</span>
        </div>
        {ballot.canVote ? (
          <div className="vote-buttons">
            <button className="vote-yes" disabled={busy} onClick={() => void run(() => api.vote(true))}>{isDead ? 'Spend ghost vote' : 'Raise hand'} <span>Yes</span></button>
            <button className="vote-no" disabled={busy} onClick={() => void run(() => api.vote(false))}>{isDead ? 'Keep ghost vote' : 'Withhold'} <span>No</span></button>
          </div>
        ) : <div className="vote-recorded">{ballot.yourVote !== null ? `${isDead ? 'Your final ghost vote' : 'Your vote'} is recorded: ${ballot.yourVote ? 'Yes' : 'No'}` : isDead ? 'Your ghost vote has already been spent. You cannot vote again.' : 'You cannot vote on this nomination.'}</div>}
        <div className="ready-progress"><span>{ballot.votesSubmitted} of {ballot.eligibleCount} eligible voters have responded · choices hidden until close</span><div><i style={{ width: `${ballot.votesSubmitted / Math.max(1, ballot.eligibleCount) * 100}%` }} /></div></div>
      </section>
    );
  }
  const myTurn = state.currentNominatorId === state.selfId;
  const living = state.players.filter((player) => player.alive);
  const eligibleIds = living.filter((player) => !state.nominatedToday.includes(player.id)).map((player) => player.id);
  return (
    <section className="action-panel">
      <p className="eyebrow-text">Day {state.day} · Nominations</p>
      <h2>{myTurn ? 'Your nomination turn' : `${current?.name ?? 'A player'} is considering a nomination`}</h2>
      {state.onBlock && <div className="on-block">Currently marked: <strong>{state.players.find((player) => player.id === state.onBlock?.playerId)?.name}</strong> with {state.onBlock.votes} votes. A later nomination needs more.</div>}
      {myTurn ? (
        <>
          <p>Choose one living player who has not been nominated today, or pass. A tie for the highest vote clears the mark.</p>
          <TargetPicker players={living} eligibleIds={eligibleIds} selected={selected} count={1} onChange={setSelected} disabled={busy} />
          <div className="button-row"><button className="primary-button" disabled={selected.length !== 1 || busy} onClick={() => void run(() => api.nominate(selected[0]))}>Nominate<span>→</span></button><button className="secondary-button" disabled={busy} onClick={() => void run(() => api.nominate(null))}>Pass this turn<span>→</span></button></div>
        </>
      ) : <div className="waiting-host"><span className="pulse-dot" /> Speak openly while you wait for your turn.</div>}
    </section>
  );
}
