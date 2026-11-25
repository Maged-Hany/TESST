import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import WeekStrip from '../components/calories/WeekStrip.jsx';
import BudgetPanel from '../components/calories/BudgetPanel.jsx';
import MealLog from '../components/calories/MealLog.jsx';
import MealComposer from '../components/calories/MealComposer.jsx';
import ProfileDialog from '../components/calories/ProfileDialog.jsx';
import { api } from '../lib/api.js';
import { shiftDate, toDateString } from '../lib/dates.js';
import { defaultMealType } from '../lib/meals.js';
import '../styles/my-calories.css';

export default function MyCalories() {
  const today = toDateString();

  const [selectedDate, setSelectedDate] = useState(today);
  const [windowEnd, setWindowEnd] = useState(today);
  const [mealType, setMealType] = useState(() => defaultMealType());

  const [profile, setProfile] = useState(null);
  const [day, setDay] = useState({ status: 'loading', data: null, error: '' });
  const [totals, setTotals] = useState({});
  const [weekTarget, setWeekTarget] = useState(0);
  const [notice, setNotice] = useState('');

  const [profileOpen, setProfileOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');

  const composerRef = useRef(null);
  const afterProfileRef = useRef(null); // runs once body info has been saved
  const dayRequestRef = useRef(0); // ignores responses from days we already left

  // Body profile: loaded once, not on every day change.
  useEffect(() => {
    api('/api/profile')
      .then(setProfile)
      .catch((err) => setNotice(err.message));
  }, []);

  const loadDay = useCallback(async (date) => {
    const requestId = ++dayRequestRef.current;
    setDay({ status: 'loading', data: null, error: '' });
    try {
      const data = await api(`/api/food-logs?date=${encodeURIComponent(date)}`);
      if (requestId !== dayRequestRef.current) return;
      setDay({ status: 'ready', data, error: '' });
      setTotals((t) => ({ ...t, [date]: data.consumed.calories }));
    } catch (err) {
      if (requestId !== dayRequestRef.current) return;
      setDay({ status: 'error', data: null, error: err.message });
    }
  }, []);

  useEffect(() => {
    loadDay(selectedDate);
  }, [selectedDate, loadDay]);

  // Per-day totals for the week strip.
  useEffect(() => {
    let cancelled = false;
    const from = shiftDate(windowEnd, -6);
    api(`/api/food-logs/summary?from=${from}&to=${windowEnd}`)
      .then((res) => {
        if (cancelled) return;
        setWeekTarget(res.target_calories);
        setTotals((t) => {
          const next = { ...t };
          for (let i = 0; i < 7; i += 1) next[shiftDate(from, i)] = 0;
          for (const d of res.days) next[d.date] = d.calories;
          return next;
        });
      })
      .catch(() => {}); // the strip is a nicety; the day itself reports errors
    return () => {
      cancelled = true;
    };
  }, [windowEnd]);

  // A save/delete answers with the fresh summary for that day.
  function applySummary(summary) {
    setTotals((t) => ({ ...t, [summary.date]: summary.consumed.calories }));
    if (summary.date === selectedDate) {
      dayRequestRef.current += 1; // drop any in-flight reload of this day
      setDay({ status: 'ready', data: summary, error: '' });
    }
  }

  async function handleDelete(id) {
    setNotice('');
    try {
      const payload = await api(`/api/food-logs/${id}`, { method: 'DELETE' });
      applySummary(payload.summary);
    } catch (err) {
      setNotice(err.message);
    }
  }

  function handleAdd(type) {
    setMealType(type);
    composerRef.current?.focus();
  }

  function requireProfile(next) {
    if (profile?.profile_completed) {
      next();
      return;
    }
    afterProfileRef.current = next;
    setProfileError('');
    setProfileOpen(true);
  }

  function openProfile() {
    afterProfileRef.current = null;
    setProfileError('');
    setProfileOpen(true);
  }

  function closeProfile() {
    afterProfileRef.current = null;
    setProfileOpen(false);
  }

  async function saveProfile(form) {
    setProfileSaving(true);
    setProfileError('');
    try {
      const updated = await api('/api/profile', {
        method: 'PUT',
        body: {
          weight_kg: Number(form.weight_kg),
          height_cm: Number(form.height_cm),
          age: Number(form.age),
          gender: form.gender,
          activity_level: form.activity_level,
          goal: form.goal,
          health_notes: form.health_notes,
          recalculate_targets: true,
          profile_completed: true,
        },
      });
      setProfile(updated);
      setProfileOpen(false);
      loadDay(selectedDate); // targets changed
      setWeekTarget(updated.daily_calorie_target);
      const resume = afterProfileRef.current;
      afterProfileRef.current = null;
      if (resume) resume();
    } catch (err) {
      setProfileError(err.message);
    } finally {
      setProfileSaving(false);
    }
  }

  return (
    <div className="page-shell mc">
      <div className="page-shell__beam" aria-hidden="true" />

      <div className="mc-container">
        <header className="mc-top">
          <h1 className="mc-title">My Calories</h1>
        </header>

        <WeekStrip
          selectedDate={selectedDate}
          today={today}
          windowEnd={windowEnd}
          totals={totals}
          target={weekTarget || day.data?.targets?.calories || 0}
          onSelect={setSelectedDate}
          onShift={(delta) => setWindowEnd((end) => {
            const next = shiftDate(end, delta);
            return next > today ? today : next;
          })}
          onToday={() => {
            setSelectedDate(today);
            setWindowEnd(today);
          }}
        />

        {notice && (
          <div className="mc-alert" role="alert">
            <span>{notice}</span>
            <button type="button" className="mc-icon-btn" aria-label="Dismiss message" onClick={() => setNotice('')}>
              <X size={14} />
            </button>
          </div>
        )}

        <div className="mc-layout">
          <BudgetPanel
            status={day.status}
            data={day.data}
            error={day.error}
            profile={profile}
            onRetry={() => loadDay(selectedDate)}
            onEditProfile={openProfile}
          />

          <div className="mc-composer-slot">
            <MealComposer
              ref={composerRef}
              date={selectedDate}
              today={today}
              mealType={mealType}
              onMealTypeChange={setMealType}
              requireProfile={requireProfile}
              onSaved={applySummary}
            />
          </div>

          <MealLog
            status={day.status}
            data={day.data}
            onAdd={handleAdd}
            onDelete={handleDelete}
          />
        </div>
      </div>

      <ProfileDialog
        open={profileOpen}
        profile={profile}
        saving={profileSaving}
        error={profileError}
        onSave={saveProfile}
        onClose={closeProfile}
      />
    </div>
  );
}
