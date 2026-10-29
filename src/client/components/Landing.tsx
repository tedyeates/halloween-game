import { useState, type FormEvent } from 'react';
import type { GameMode } from '../../shared/types.js';

interface LandingProps {
  onEnter: (mode: 'create' | 'join', name: string, code?: string, gameMode?: GameMode) => Promise<void>;
  busy: boolean;
  error: string;
  restoring: boolean;
}

export default function Landing({ onEnter, busy, error, restoring }: LandingProps) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [gameMode, setGameMode] = useState<GameMode>('automated');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    void onEnter(mode, name, code, gameMode);
  }

  return (
    <main className="landing page-shell">
      <section className="hero">
        <div className="eyebrow"><span /> A social deduction ritual <span /></div>
        <h1>Hollowbrook</h1>
        <p className="hero-subtitle">Trust is a candle in the dark.<br />Someone here wants yours to go out.</p>
        <div className="feature-row" aria-label="Game features">
          <span>5–8 players</span><i>◆</i><span>Online rooms</span><i>◆</i><span>Fully automated</span>
        </div>
      </section>

      <section className="entry-card ornate-card">
        <div className="card-corner top-left" /><div className="card-corner top-right" />
        <div className="segmented" role="tablist" aria-label="Room options">
          <button className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')} role="tab" aria-selected={mode === 'create'}>Create a room</button>
          <button className={mode === 'join' ? 'active' : ''} onClick={() => setMode('join')} role="tab" aria-selected={mode === 'join'}>Join a room</button>
        </div>
        <form onSubmit={submit}>
          <label htmlFor="name">Your name</label>
          <input id="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="How the town will know you" maxLength={20} autoComplete="nickname" required />
          {mode === 'create' && (
            <fieldset className="mode-choice">
              <legend>Who runs the game?</legend>
              <label className={gameMode === 'automated' ? 'selected' : ''}>
                <input type="radio" name="game-mode" checked={gameMode === 'automated'} onChange={() => setGameMode('automated')} />
                <strong>Automated</strong>
                <small>The app is the Storyteller.</small>
              </label>
              <label className={gameMode === 'storyteller' ? 'selected' : ''}>
                <input type="radio" name="game-mode" checked={gameMode === 'storyteller'} onChange={() => setGameMode('storyteller')} />
                <strong>Storyteller</strong>
                <small>You guide private visits.</small>
              </label>
            </fieldset>
          )}
          {mode === 'join' && (
            <>
              <label htmlFor="code">Room code</label>
              <input id="code" className="code-input" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="ABCDE" maxLength={5} autoCapitalize="characters" required />
            </>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button full-width" disabled={busy || restoring}>
            {restoring ? 'Finding your old room…' : busy ? 'Lighting the lanterns…' : mode === 'create' ? 'Create your gathering' : 'Enter Hollowbrook'}
            <span aria-hidden="true">→</span>
          </button>
        </form>
        <p className="privacy-note">Each player joins on their own device. Roles and night actions stay secret.</p>
      </section>

      <section className="how-it-works">
        <article><span className="step-number">I</span><div><h2>Receive your role</h2><p>Good hunts the Headless Horseman. Evil hides in plain sight.</p></div></article>
        <article><span className="step-number">II</span><div><h2>Follow the night</h2><p>The app privately guides every action and delivers secret information.</p></div></article>
        <article><span className="step-number">III</span><div><h2>Accuse by daylight</h2><p>Discuss, nominate, vote, and execute—before only two remain.</p></div></article>
      </section>
    </main>
  );
}
