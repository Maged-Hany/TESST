import { useState } from 'react';
import { ArrowRight, LogOut } from 'lucide-react';
import Segmented from '../components/calories/Segmented.jsx';
import { api } from '../lib/api.js';
import { toDateString } from '../lib/dates.js';

const AUTH_MODES = [
  { value: 'register', label: 'Create Account' },
  { value: 'login', label: 'Sign In' },
];

const SPLIT_NAMES = {
  ppl: 'Push / Pull / Legs (PPL)',
  upper_lower: 'Upper / Lower Split',
  arnold: 'Arnold Split',
  bro: 'Body-Part (Bro Split)',
  full_body: 'Full Body (3x / Week)',
  custom: 'Custom Manual Split',
};

export default function Account({ user, streak, onAuthenticated, onLogout, onOpenStreakPopup }) {
  const [mode, setMode] = useState('register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const payload =
        mode === 'register'
          ? { name: name.trim(), email: email.trim(), password, date: toDateString() }
          : { email: email.trim(), password, date: toDateString() };

      const res = await api(endpoint, { method: 'POST', body: payload });
      onAuthenticated(res);
    } catch (err) {
      setError(err.message || 'Could not complete request.');
    } finally {
      setBusy(false);
    }
  }

  if (user) {
    const days = Number(streak?.current_streak || 0);
    const longest = Number(streak?.longest_streak || days);
    const isElite = days > 10;

    return (
      <div className="page-shell mc">
        <div className="page-shell__beam" aria-hidden="true" />

        <div className="mc-container auth-signed">
          <div className="auth-grid">
            <section className="auth-intro">
              <p className="auth-kicker">Signed in as {user.email}</p>
              <h1 className="mc-title">{user.name}</h1>
              <p className="mc-section-copy">
                Your daily meals, weekly meal plan, workout split, and training streak are saved to
                your account.
              </p>

              <div className="auth-stats">
                <div className={`auth-stat ${isElite ? 'is-elite' : ''}`}>
                  <span className="auth-stat__label">Current streak</span>
                  <strong className="auth-stat__num tabular">
                    {days} {days === 1 ? 'day' : 'days'}
                  </strong>
                  <span className="auth-stat__note">
                    {isElite ? 'Crimson 10+ badge unlocked' : `${Math.max(0, 11 - days)} more days to crimson badge`}
                  </span>
                </div>

                <div className="auth-stat">
                  <span className="auth-stat__label">Longest streak</span>
                  <strong className="auth-stat__num tabular">
                    {longest} {longest === 1 ? 'day' : 'days'}
                  </strong>
                  <span className="auth-stat__note">
                    {SPLIT_NAMES[user.split_method] || 'Push / Pull / Legs'}
                  </span>
                </div>
              </div>
            </section>

            <aside className="f-panel auth-panel">
              <h2 className="mc-section-title">Account actions</h2>
              <p className="mc-section-copy">
                Log in or complete your workout each day to grow your streak.
              </p>

              <div className="auth-panel__actions">
                <a href="#workouts" className="f-cta auth-cta-full">
                  <span>Go to Workouts</span>
                  <span className="f-cta__icon" aria-hidden="true">
                    <ArrowRight size={14} strokeWidth={1.75} />
                  </span>
                </a>

                <button type="button" className="f-btn-secondary auth-cta-full" onClick={onOpenStreakPopup}>
                  View streak progress
                </button>

                <button type="button" className="f-btn-secondary auth-cta-full" onClick={onLogout}>
                  <LogOut size={14} strokeWidth={1.75} aria-hidden="true" />
                  <span>Sign out</span>
                </button>
              </div>
            </aside>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell mc">
      <div className="page-shell__beam" aria-hidden="true" />

      <div className="mc-container">
        <div className="auth-grid">
          <section className="auth-intro">
            <h1 className="mc-title">
              {mode === 'register' ? 'Create your account.' : 'Welcome back.'}
            </h1>
            <p className="mc-section-copy">
              Your daily meals, custom workout split, and training streak stay tied to your account
              every day you show up.
            </p>

            <ul className="auth-points">
              <li>Log in or log a workout on consecutive days to build your streak</li>
              <li>Pass 10 days in a row to unlock the crimson athlete streak badge</li>
            </ul>
          </section>

          <section className="f-panel auth-panel" aria-label={mode === 'register' ? 'Create account' : 'Sign in'}>
            <Segmented
              name="auth-mode"
              legend="Account access"
              hideLegend
              options={AUTH_MODES}
              value={mode}
              onChange={(next) => {
                setMode(next);
                setError('');
              }}
            />

            {error && (
              <p className="mc-composer__error" role="alert">
                {error}
              </p>
            )}

            <form onSubmit={handleSubmit} className="mc-composer__form">
              {mode === 'register' && (
                <label className="mc-field">
                  <span className="mc-field__label">Full name</span>
                  <input
                    type="text"
                    required
                    autoComplete="name"
                    placeholder="Alex Rivera"
                    className="f-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              )}

              <label className="mc-field">
                <span className="mc-field__label">Email address</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="alex@example.com"
                  className="f-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>

              <label className="mc-field">
                <span className="mc-field__label">Password</span>
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  placeholder="At least 8 characters"
                  className="f-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>

              <div className="mc-composer__actions">
                <button type="submit" className="f-cta" disabled={busy}>
                  <span>
                    {busy
                      ? mode === 'register'
                        ? 'Creating account...'
                        : 'Signing in...'
                      : mode === 'register'
                      ? 'Create account'
                      : 'Sign in'}
                  </span>
                  <span className="f-cta__icon" aria-hidden="true">
                    <ArrowRight size={14} strokeWidth={1.75} />
                  </span>
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
