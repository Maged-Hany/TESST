import { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import Segmented from './Segmented.jsx';

const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

const GOALS = [
  { value: 'cut', label: 'Lose fat' },
  { value: 'maintain', label: 'Maintain weight' },
  { value: 'bulk', label: 'Build muscle' },
];

const ACTIVITY = [
  { value: 'sedentary', label: 'Sedentary', hint: 'Little to no exercise' },
  { value: 'light', label: 'Light', hint: 'Exercise 1 to 3 days a week' },
  { value: 'moderate', label: 'Moderate', hint: 'Exercise 3 to 5 days a week' },
  { value: 'active', label: 'Active', hint: 'Hard training 6 to 7 days a week' },
  { value: 'very_active', label: 'Very active', hint: 'Intense daily training or physical work' },
];

function formFromProfile(profile) {
  return {
    weight_kg: profile?.weight_kg ?? 78.5,
    height_cm: profile?.height_cm ?? 178,
    age: profile?.age ?? 27,
    gender: profile?.gender || 'male',
    activity_level: profile?.activity_level || 'moderate',
    goal: profile?.goal || 'cut',
    health_notes: profile?.health_notes || '',
  };
}

function ProfileForm({ profile, saving, error, onSubmit, onCancel }) {
  const [form, setForm] = useState(() => formFromProfile(profile));
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const setInput = (key) => (e) => set(key)(e.target.value);

  return (
    <form
      className="mc-dialog__panel"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <header>
        <h2 id="mc-profile-title" className="mc-section-title">
          Your body info
        </h2>
        <p className="mc-section-copy">
          Foody uses this to set your daily targets and to tailor meal estimates. You can change it
          any time.
        </p>
      </header>

      <div className="mc-profile__grid">
        <label className="mc-field">
          <span className="mc-field__label">Weight (kg)</span>
          <input type="number" inputMode="decimal" step="0.1" min="25" max="300" required className="f-input tabular" value={form.weight_kg} onChange={setInput('weight_kg')} />
        </label>
        <label className="mc-field">
          <span className="mc-field__label">Height (cm)</span>
          <input type="number" inputMode="decimal" step="0.5" min="100" max="250" required className="f-input tabular" value={form.height_cm} onChange={setInput('height_cm')} />
        </label>
        <label className="mc-field">
          <span className="mc-field__label">Age</span>
          <input type="number" inputMode="numeric" min="13" max="100" required className="f-input tabular" value={form.age} onChange={setInput('age')} />
        </label>
      </div>

      <Segmented name="gender" legend="Gender" options={GENDERS} value={form.gender} onChange={set('gender')} />
      <Segmented name="goal" legend="Goal" options={GOALS} value={form.goal} onChange={set('goal')} />

      <fieldset className="mc-activity">
        <legend className="mc-field__label">Activity level</legend>
        {ACTIVITY.map((opt) => (
          <label key={opt.value} className="mc-activity__option">
            <input
              type="radio"
              name="activity"
              value={opt.value}
              checked={form.activity_level === opt.value}
              onChange={() => set('activity_level')(opt.value)}
              className="mc-activity__input"
            />
            <span className="mc-activity__label">{opt.label}</span>
            <span className="mc-activity__hint">{opt.hint}</span>
          </label>
        ))}
      </fieldset>

      <label className="mc-field">
        <span className="mc-field__label">Allergies or diet notes (optional)</span>
        <input
          type="text"
          className="f-input"
          maxLength={300}
          placeholder="Lactose intolerant, high protein, no shellfish"
          value={form.health_notes}
          onChange={setInput('health_notes')}
        />
      </label>

      {error && (
        <p className="mc-composer__error" role="alert">
          {error}
        </p>
      )}

      <div className="mc-dialog__actions">
        <button type="button" className="f-btn-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="f-cta" disabled={saving}>
          <span>{saving ? 'Saving' : 'Save body info'}</span>
          <span className="f-cta__icon" aria-hidden="true">
            <ArrowRight size={14} strokeWidth={1.75} />
          </span>
        </button>
      </div>
    </form>
  );
}

export default function ProfileDialog({ open, profile, saving, error, onSave, onClose }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="mc-dialog"
      aria-labelledby="mc-profile-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open && (
        <ProfileForm profile={profile} saving={saving} error={error} onSubmit={onSave} onCancel={onClose} />
      )}
    </dialog>
  );
}
