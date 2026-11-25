import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, ExternalLink, Play, Plus, Trash2, X } from 'lucide-react';
import CustomSelect from '../components/CustomSelect.jsx';
import Segmented from '../components/calories/Segmented.jsx';
import { api } from '../lib/api.js';
import { toDateString } from '../lib/dates.js';

const SPLIT_OPTIONS = [
  { value: 'ppl', label: 'Push / Pull / Legs (PPL)', sub: '6 days', display: 'Push / Pull / Legs (PPL)' },
  { value: 'upper_lower', label: 'Upper / Lower Split', sub: '4 days', display: 'Upper / Lower Split' },
  { value: 'arnold', label: 'Arnold Split', sub: '6 days', display: 'Arnold Split' },
  { value: 'bro', label: 'Body-Part (Bro Split)', sub: '5 days', display: 'Body-Part (Bro Split)' },
  { value: 'full_body', label: 'Full Body (3x / Week)', sub: '3 days', display: 'Full Body (3x / Week)' },
  { value: 'custom', label: 'Custom Manual Split', sub: 'edit any day', display: 'Custom Manual Split' },
];

const COMPOSER_TABS = [
  { value: 'recommended', label: '6 Recommended' },
  { value: 'manual', label: 'Manual' },
  { value: 'day', label: 'Edit Day' },
];

const DAY_TYPE_OPTIONS = [
  { value: 'train', label: 'Training day' },
  { value: 'rest', label: 'Rest day' },
];

const SET_TYPE_OPTIONS = [
  { value: 'working', label: 'Working set' },
  { value: 'warmup', label: 'Warm-up' },
];

const DAY_LABELS = {
  monday: { short: 'Mon', full: 'Monday' },
  tuesday: { short: 'Tue', full: 'Tuesday' },
  wednesday: { short: 'Wed', full: 'Wednesday' },
  thursday: { short: 'Thu', full: 'Thursday' },
  friday: { short: 'Fri', full: 'Friday' },
  saturday: { short: 'Sat', full: 'Saturday' },
  sunday: { short: 'Sun', full: 'Sunday' },
};

const SWATCH_VARS = ['var(--mc-breakfast)', 'var(--mc-lunch)', 'var(--mc-dinner)', 'var(--mc-snack)'];

function todayWeekdayKey() {
  const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return names[new Date().getDay()];
}

function shortFocusBadge(plan) {
  if (!plan) return '';
  if (plan.is_rest_day) return 'Rest';
  const firstWord = String(plan.title || '')
    .replace(/\s+Day.*$/i, '')
    .trim();
  return firstWord.length <= 12 ? firstWord : firstWord.slice(0, 11);
}

function PlannedExerciseRow({ item, onWatchVideo, onQuickSet, onRemove }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirmRemove() {
    setBusy(true);
    try {
      await onRemove(item.id);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div className="mc-group">
      <div className="wk-ex-head">
        <div className="wk-ex-head__main">
          <h3 className="mc-group__title">{item.exercise_name}</h3>
          <p className="wk-ex-head__meta tabular">
            <span>{item.muscle_group}</span>
            <span>·</span>
            <span>{item.equipment}</span>
            <span>·</span>
            <strong>
              {item.target_sets} sets &times; {item.target_reps} reps
            </strong>
            {Number(item.target_weight_kg) > 0 && <span>· {item.target_weight_kg} kg</span>}
          </p>
        </div>

        <div className="wk-ex-head__actions">
          {item.youtube_id && (
            <button
              type="button"
              className="mc-text-link"
              onClick={() => onWatchVideo(item)}
            >
              Watch tutorial
            </button>
          )}
          <button
            type="button"
            className="mc-add"
            onClick={() => onQuickSet(item)}
          >
            <Plus size={14} strokeWidth={1.8} aria-hidden="true" />
            <span>Log set</span>
          </button>

          {confirming ? (
            <>
              <button type="button" className="mc-danger-link" disabled={busy} onClick={confirmRemove}>
                {busy ? 'Removing' : 'Remove'}
              </button>
              <button type="button" className="mc-text-link" disabled={busy} onClick={() => setConfirming(false)}>
                Keep
              </button>
            </>
          ) : (
            <button
              type="button"
              className="mc-icon-btn mc-icon-btn--quiet"
              aria-label={`Remove ${item.exercise_name}`}
              onClick={() => setConfirming(true)}
            >
              <Trash2 size={15} strokeWidth={1.6} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Workouts({ user, onStreakUpdate }) {
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [splitMethod, setSplitMethod] = useState(user?.split_method || 'ppl');
  const [switchingSplit, setSwitchingSplit] = useState(false);

  const [plans, setPlans] = useState([]);
  const [selectedDayKey, setSelectedDayKey] = useState(todayWeekdayKey);
  const [recommendedByMuscle, setRecommendedByMuscle] = useState({});
  const [muscleGroups, setMuscleGroups] = useState([
    'Chest',
    'Back',
    'Shoulders',
    'Legs',
    'Biceps',
    'Triceps',
    'Core',
  ]);
  const [recentLogs, setRecentLogs] = useState([]);

  // Right Composer state
  const [composerTab, setComposerTab] = useState('recommended');
  const [selectedMuscle, setSelectedMuscle] = useState('Chest');
  const [selectedRecId, setSelectedRecId] = useState(null);
  const [activeVideoExercise, setActiveVideoExercise] = useState(null);

  const [recForm, setRecForm] = useState({ sets: '4', reps: '8-10', weight: '30' });
  const [manualMode, setManualMode] = useState('plan'); // 'plan' | 'set'
  const [manualPlanForm, setManualPlanForm] = useState({
    name: '',
    muscle_group: 'Chest',
    sets: '3',
    reps: '10',
    weight: '20',
  });
  const [setLogForm, setSetLogForm] = useState({
    exercise_id: '',
    exercise_name: '',
    weight_kg: '60',
    reps: '8',
    set_type: 'working',
  });
  const [dayForm, setDayForm] = useState({
    title: '',
    focus_area: '',
    day_type: 'train',
  });
  const [busyAction, setBusyAction] = useState(false);

  const loadWorkoutsData = useCallback(async () => {
    setLoading(true);
    setNotice('');
    try {
      const [plansRes, exRes, logsRes, profRes] = await Promise.all([
        api('/api/workout-plans'),
        api('/api/exercises'),
        api('/api/workout-logs?limit=14'),
        api('/api/profile'),
      ]);

      setPlans(plansRes || []);
      if (profRes?.split_method) {
        setSplitMethod(profRes.split_method);
      }
      if (exRes?.recommended_by_muscle) {
        setRecommendedByMuscle(exRes.recommended_by_muscle);
      }
      if (exRes?.recommended_muscle_groups?.length) {
        setMuscleGroups(exRes.recommended_muscle_groups);
      }
      const chestFirst = exRes?.recommended_by_muscle?.Chest?.[0];
      if (chestFirst) {
        setSelectedRecId(chestFirst.id);
        setActiveVideoExercise(chestFirst);
      }
      setRecentLogs(logsRes || []);
    } catch (err) {
      setNotice(err.message || 'Could not load workouts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkoutsData();
  }, [loadWorkoutsData, user?.id]);

  const activePlan = useMemo(
    () => plans.find((p) => p.day_of_week === selectedDayKey) || plans[0] || null,
    [plans, selectedDayKey]
  );

  // Sync Edit Day form & default set exercise when activePlan changes
  useEffect(() => {
    if (!activePlan) return;
    setDayForm({
      title: activePlan.title || '',
      focus_area: activePlan.focus_area || '',
      day_type: activePlan.is_rest_day ? 'rest' : 'train',
    });
    const firstEx = activePlan.exercises?.[0];
    if (firstEx) {
      setSetLogForm((prev) => ({
        ...prev,
        exercise_id: String(firstEx.exercise_id),
        exercise_name: firstEx.exercise_name,
        weight_kg: String(firstEx.target_weight_kg || 20),
        reps: String(parseInt(String(firstEx.target_reps).split('-')[0], 10) || 8),
      }));
    }
  }, [activePlan]);

  const currentMuscleList = recommendedByMuscle[selectedMuscle] || [];
  const chosenRec =
    currentMuscleList.find((x) => x.id === selectedRecId) || currentMuscleList[0] || null;

  useEffect(() => {
    if (chosenRec) {
      setActiveVideoExercise(chosenRec);
    }
  }, [chosenRec]);

  // Muscle breakdown segments for the 44px bar
  const muscleSegments = useMemo(() => {
    if (!activePlan?.exercises?.length) return [];
    const map = new Map();
    for (const ex of activePlan.exercises) {
      const mg = ex.muscle_group || 'Other';
      map.set(mg, (map.get(mg) || 0) + Number(ex.target_sets || 0));
    }
    return [...map.entries()].map(([label, sets], idx) => ({
      label,
      sets,
      color: SWATCH_VARS[idx % SWATCH_VARS.length],
    }));
  }, [activePlan]);

  const totalScheduledSets = useMemo(
    () => (activePlan?.exercises || []).reduce((sum, x) => sum + Number(x.target_sets || 0), 0),
    [activePlan]
  );

  const loggedPlanIdsToday = useMemo(() => {
    const today = toDateString();
    return new Set(
      recentLogs.filter((l) => l.date === today && l.workout_plan_id).map((l) => l.workout_plan_id)
    );
  }, [recentLogs]);

  async function handleSplitChange(nextSplit) {
    setSplitMethod(nextSplit);
    setSwitchingSplit(true);
    setNotice('');
    try {
      const res = await api('/api/workout-plans/apply-split', {
        method: 'POST',
        body: { split_method: nextSplit },
      });
      setPlans(res.plans || []);
    } catch (err) {
      setNotice(err.message);
    } finally {
      setSwitchingSplit(false);
    }
  }

  async function handleAddRecommended(e) {
    e.preventDefault();
    if (!activePlan || !chosenRec) return;
    setBusyAction(true);
    setNotice('');
    try {
      const updatedPlan = await api(`/api/workout-plans/${activePlan.id}/exercises`, {
        method: 'POST',
        body: {
          exercise_id: chosenRec.id,
          target_sets: Number(recForm.sets) || 3,
          target_reps: recForm.reps || '8-10',
          target_weight_kg: Number(recForm.weight) || 0,
        },
      });
      setPlans((prev) => prev.map((p) => (p.id === updatedPlan.id ? updatedPlan : p)));
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusyAction(false);
    }
  }

  async function handleAddManualExercise(e) {
    e.preventDefault();
    if (!activePlan || !manualPlanForm.name.trim()) return;
    setBusyAction(true);
    setNotice('');
    try {
      const updatedPlan = await api(`/api/workout-plans/${activePlan.id}/exercises`, {
        method: 'POST',
        body: {
          exercise_name: manualPlanForm.name.trim(),
          muscle_group: manualPlanForm.muscle_group,
          target_sets: Number(manualPlanForm.sets) || 3,
          target_reps: manualPlanForm.reps || '10',
          target_weight_kg: Number(manualPlanForm.weight) || 0,
        },
      });
      setPlans((prev) => prev.map((p) => (p.id === updatedPlan.id ? updatedPlan : p)));
      setManualPlanForm((f) => ({ ...f, name: '' }));
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusyAction(false);
    }
  }

  async function handleRemoveExercise(itemId) {
    if (!activePlan) return;
    setNotice('');
    try {
      const updatedPlan = await api(
        `/api/workout-plans/${activePlan.id}/exercises/${itemId}`,
        { method: 'DELETE' }
      );
      setPlans((prev) => prev.map((p) => (p.id === updatedPlan.id ? updatedPlan : p)));
    } catch (err) {
      setNotice(err.message);
    }
  }

  async function handleSaveDaySettings(e) {
    e.preventDefault();
    if (!activePlan) return;
    setBusyAction(true);
    setNotice('');
    try {
      const updatedPlan = await api(`/api/workout-plans/${activePlan.id}`, {
        method: 'PUT',
        body: {
          title: dayForm.title.trim() || activePlan.title,
          focus_area: dayForm.focus_area.trim() || activePlan.focus_area,
          is_rest_day: dayForm.day_type === 'rest',
        },
      });
      setPlans((prev) => prev.map((p) => (p.id === updatedPlan.id ? updatedPlan : p)));
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusyAction(false);
    }
  }

  async function handleLogFullWorkoutDay() {
    if (!activePlan) return;
    setBusyAction(true);
    setNotice('');
    try {
      const created = await api('/api/workout-logs', {
        method: 'POST',
        body: {
          date: toDateString(),
          from_workout_plan_id: activePlan.id,
          title: activePlan.title,
          focus_area: activePlan.focus_area,
        },
      });
      setRecentLogs((prev) => [created, ...prev]);
      if (created.streak) {
        onStreakUpdate?.(created.streak, true);
      }
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusyAction(false);
    }
  }

  async function handleLogSingleSet(e) {
    e.preventDefault();
    setBusyAction(true);
    setNotice('');
    try {
      const created = await api('/api/workout-logs', {
        method: 'POST',
        body: {
          date: toDateString(),
          workout_plan_id: activePlan?.id || null,
          title: activePlan?.title || 'Training Session',
          focus_area: activePlan?.focus_area || 'Strength',
          duration_min: 45,
          sets: [
            {
              exercise_id: setLogForm.exercise_id ? Number(setLogForm.exercise_id) : null,
              exercise_name: setLogForm.exercise_name || 'Exercise',
              set_number: 1,
              reps: Number(setLogForm.reps) || 8,
              weight_kg: Number(setLogForm.weight_kg) || 0,
              is_warmup: setLogForm.set_type === 'warmup',
            },
          ],
        },
      });
      setRecentLogs((prev) => [created, ...prev]);
      if (created.streak) {
        onStreakUpdate?.(created.streak, Boolean(created.streak.streak_extended));
      }
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusyAction(false);
    }
  }

  function handleWatchTutorial(item) {
    setActiveVideoExercise({
      name: item.exercise_name,
      youtube_id: item.youtube_id,
      instructions: item.instructions,
      muscle_group: item.muscle_group,
    });
    setComposerTab('recommended');
  }

  function handleQuickSet(item) {
    setSetLogForm({
      exercise_id: String(item.exercise_id),
      exercise_name: item.exercise_name,
      weight_kg: String(item.target_weight_kg || 20),
      reps: String(parseInt(String(item.target_reps).split('-')[0], 10) || 8),
      set_type: 'working',
    });
    setComposerTab('manual');
    setManualMode('set');
  }

  const dayMeta = DAY_LABELS[selectedDayKey] || { short: 'Mon', full: 'Monday' };
  const isDayLoggedToday = activePlan && loggedPlanIdsToday.has(activePlan.id);

  return (
    <div className="page-shell mc">
      <div className="page-shell__beam" aria-hidden="true" />

      <div className="mc-container">
        {/* Page Header + Split Method Picker */}
        <header className="wk-top">
          <h1 className="mc-title">Workouts</h1>

          <div className="wk-split-picker">
            <span className="mc-field__label">Training split method</span>
            <CustomSelect
              ariaLabel="Training split method"
              value={splitMethod}
              options={SPLIT_OPTIONS}
              onChange={handleSplitChange}
            />
          </div>
        </header>

        {/* 7-Day Split Strip */}
        {!loading && plans.length > 0 && (
          <nav className="mc-week" aria-label="Weekly workout schedule">
            <ul className="mc-week__days">
              {plans.map((p) => {
                const selected = p.day_of_week === selectedDayKey;
                const dInfo = DAY_LABELS[p.day_of_week] || { short: p.day_of_week, full: p.day_of_week };
                const doneToday = loggedPlanIdsToday.has(p.id);
                const meterPct = doneToday ? 100 : p.is_rest_day ? 0 : p.exercises?.length ? 35 : 0;

                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={`mc-day ${selected ? 'is-selected' : ''}`}
                      aria-pressed={selected}
                      onClick={() => setSelectedDayKey(p.day_of_week)}
                    >
                      <span className="mc-day__name">{dInfo.short}</span>
                      <span className="wk-day__tag">{shortFocusBadge(p)}</span>
                      <span className="mc-day__meter" aria-hidden="true">
                        <span style={{ width: `${meterPct}%` }} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}

        {notice && (
          <div className="mc-alert" role="alert">
            <span>{notice}</span>
            <button
              type="button"
              className="mc-icon-btn"
              aria-label="Dismiss message"
              onClick={() => setNotice('')}
            >
              <X size={14} />
            </button>
          </div>
        )}

        <div className="mc-layout">
          {/* LEFT COLUMN: Day Summary, Muscle Volume Strip & Planned Exercises */}
          {loading || switchingSplit ? (
            <section className="mc-budget" aria-busy="true" aria-label="Loading workouts">
              <div className="sk sk--hero" />
              <div className="sk sk--bar" />
              <div className="wk-sk-list">
                <div className="sk sk--row" />
                <div className="sk sk--row" />
                <div className="sk sk--row" />
              </div>
            </section>
          ) : activePlan ? (
            <div className="wk-main">
              <section className="mc-budget">
                {activePlan.is_rest_day ? (
                  <>
                    <div className="mc-remaining">
                      <p className="mc-remaining__num">Rest</p>
                      <p className="mc-remaining__label">
                        {dayMeta.full} · {activePlan.focus_area || 'Recovery & Mobility'}
                      </p>
                    </div>
                    <p className="mc-budget__summary">
                      {activePlan.notes || 'Scheduled rest day for muscle recovery, hydration, and sleep.'}{' '}
                      <button
                        type="button"
                        className="mc-text-link"
                        onClick={() => setComposerTab('day')}
                      >
                        Turn into a training day
                      </button>
                    </p>
                  </>
                ) : (
                  <>
                    <div className="wk-hero-row">
                      <div className="mc-remaining">
                        <p className="mc-remaining__num tabular">{totalScheduledSets}</p>
                        <p className="mc-remaining__label">
                          sets scheduled · <strong className="wk-strong">{activePlan.title}</strong>
                        </p>
                      </div>

                      <button
                        type="button"
                        className="f-cta"
                        disabled={busyAction}
                        onClick={handleLogFullWorkoutDay}
                      >
                        <span>
                          {isDayLoggedToday ? 'Day logged to streak' : 'Log workout day (+1 streak)'}
                        </span>
                        <span className="f-cta__icon" aria-hidden="true">
                          {isDayLoggedToday ? (
                            <Check size={14} strokeWidth={2} />
                          ) : (
                            <ArrowRight size={14} strokeWidth={1.75} />
                          )}
                        </span>
                      </button>
                    </div>

                    <p className="mc-budget__summary">
                      <strong>{activePlan.focus_area}</strong> · about{' '}
                      <strong>{activePlan.estimated_duration_min || 60} min</strong>.{' '}
                      <button
                        type="button"
                        className="mc-text-link"
                        onClick={() => setComposerTab('day')}
                      >
                        Edit day routine
                      </button>
                    </p>

                    {muscleSegments.length > 0 && (
                      <div className="mc-daybar">
                        <div className="mc-daybar__track">
                          <div className="mc-daybar__segments">
                            {muscleSegments.map((seg, i) => (
                              <span
                                key={seg.label}
                                className="mc-daybar__seg"
                                style={{
                                  width: `${(seg.sets / Math.max(totalScheduledSets, 1)) * 100}%`,
                                  '--seg': seg.color,
                                  '--i': i,
                                }}
                              />
                            ))}
                          </div>
                        </div>

                        <ul className="mc-daybar__legend">
                          {muscleSegments.map((seg) => (
                            <li key={seg.label}>
                              <span
                                className="mc-swatch"
                                style={{ '--seg': seg.color }}
                                aria-hidden="true"
                              />
                              {seg.label} <strong className="tabular">{seg.sets} sets</strong>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </section>

              {/* Planned Exercises List */}
              {!activePlan.is_rest_day && (
                <section className="mc-log" aria-labelledby="wk-list-title">
                  <h2 id="wk-list-title" className="mc-section-title">
                    {dayMeta.full}’s workout list
                  </h2>

                  {activePlan.exercises?.length === 0 ? (
                    <p className="mc-log__empty">
                      No exercises scheduled for {dayMeta.full} yet. Choose from the 6 recommended
                      exercises per muscle on the right, or enter any workout manually.
                    </p>
                  ) : (
                    activePlan.exercises.map((item) => (
                      <PlannedExerciseRow
                        key={item.id}
                        item={item}
                        onWatchVideo={handleWatchTutorial}
                        onQuickSet={handleQuickSet}
                        onRemove={handleRemoveExercise}
                      />
                    ))
                  )}
                </section>
              )}

              {/* Recent Logged Sessions */}
              {recentLogs.length > 0 && (
                <section className="mc-log" aria-labelledby="wk-history-title">
                  <h2 id="wk-history-title" className="mc-section-title">
                    Recent logged sessions
                  </h2>
                  <ul className="mc-rows wk-history-rows">
                    {recentLogs.slice(0, 5).map((log) => (
                      <li key={log.id} className="mc-row">
                        <div className="mc-row__main">
                          <h3 className="mc-row__name">{log.title}</h3>
                          <p className="mc-row__macros tabular">
                            <span>{log.date}</span>
                            <span>
                              <strong>{log.working_sets}</strong> working sets
                            </span>
                            {log.pr_count > 0 && (
                              <span>
                                <strong>{log.pr_count}</strong> personal record
                                {log.pr_count > 1 ? 's' : ''}
                              </span>
                            )}
                          </p>
                        </div>
                        <p className="mc-row__cal tabular">
                          {Number(log.total_volume_kg || 0).toLocaleString()}
                          <span className="wk-unit"> kg</span>
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          ) : null}

          {/* RIGHT STICKY COMPOSER: 6 Recommended + YouTube Video | Manual | Edit Day */}
          <div className="mc-composer-slot">
            <aside className="f-panel mc-composer">
              <div className="mc-composer__head">
                <h2 className="mc-section-title">Build &amp; Log</h2>
                <p className="mc-composer__for">for {dayMeta.full}</p>
              </div>

              <Segmented
                name="wk-composer-mode"
                legend="Mode"
                options={COMPOSER_TABS}
                value={composerTab}
                onChange={setComposerTab}
              />

              {/* TAB 1: 6 Recommended Popular Exercises per Muscle + Embedded YouTube Tutorial */}
              {composerTab === 'recommended' && (
                <form onSubmit={handleAddRecommended} className="mc-composer__form">
                  <div className="mc-field">
                    <span className="mc-field__label">Muscle group (6 recommended each)</span>
                    <CustomSelect
                      ariaLabel="Muscle group"
                      value={selectedMuscle}
                      options={muscleGroups.map((mg) => ({
                        value: mg,
                        label: mg,
                        sub: '6 workouts',
                      }))}
                      onChange={(mg) => {
                        setSelectedMuscle(mg);
                        const first = recommendedByMuscle[mg]?.[0];
                        if (first) setSelectedRecId(first.id);
                      }}
                    />
                  </div>

                  <div className="wk-rec-list" role="listbox" aria-label={`Recommended ${selectedMuscle} exercises`}>
                    {currentMuscleList.map((ex, i) => {
                      const chosen = chosenRec?.id === ex.id;
                      return (
                        <button
                          key={ex.id}
                          type="button"
                          role="option"
                          aria-selected={chosen}
                          className={`wk-rec-item ${chosen ? 'is-chosen' : ''}`}
                          onClick={() => {
                            setSelectedRecId(ex.id);
                            setActiveVideoExercise(ex);
                          }}
                        >
                          <span className="wk-rec-item__name">
                            {i + 1}. {ex.name}
                          </span>
                          <span className="wk-rec-item__badge">
                            <Play size={11} strokeWidth={2} aria-hidden="true" />
                            <span>Video</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Embedded YouTube Tutorial Video for the Chosen Recommended Exercise */}
                  {activeVideoExercise?.youtube_id && (
                    <div className="wk-video">
                      <div className="wk-video__frame">
                        <iframe
                          title={`${activeVideoExercise.name} tutorial`}
                          src={`https://www.youtube-nocookie.com/embed/${activeVideoExercise.youtube_id}?rel=0`}
                          loading="lazy"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      </div>
                      <div className="wk-video__meta">
                        <p className="wk-video__cue">{activeVideoExercise.instructions}</p>
                        <a
                          href={`https://www.youtube.com/watch?v=${activeVideoExercise.youtube_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mc-text-link wk-video__ext"
                        >
                          <span>Watch on YouTube</span>
                          <ExternalLink size={11} aria-hidden="true" />
                        </a>
                      </div>
                    </div>
                  )}

                  <div className="wk-triple">
                    <label className="mc-field">
                      <span className="mc-field__label">Sets</span>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        className="f-input tabular"
                        value={recForm.sets}
                        onChange={(e) => setRecForm((f) => ({ ...f, sets: e.target.value }))}
                      />
                    </label>
                    <label className="mc-field">
                      <span className="mc-field__label">Target reps</span>
                      <input
                        type="text"
                        className="f-input tabular"
                        value={recForm.reps}
                        onChange={(e) => setRecForm((f) => ({ ...f, reps: e.target.value }))}
                      />
                    </label>
                    <label className="mc-field">
                      <span className="mc-field__label">Weight (kg)</span>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        className="f-input tabular"
                        value={recForm.weight}
                        onChange={(e) => setRecForm((f) => ({ ...f, weight: e.target.value }))}
                      />
                    </label>
                  </div>

                  <div className="mc-composer__actions">
                    <button type="submit" className="f-cta" disabled={busyAction || !chosenRec}>
                      <span>Add to {dayMeta.full}</span>
                      <span className="f-cta__icon" aria-hidden="true">
                        <ArrowRight size={14} strokeWidth={1.75} />
                      </span>
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 2: Manual Custom Exercise OR Log Individual Set */}
              {composerTab === 'manual' && (
                <div className="mc-composer__form">
                  <Segmented
                    name="wk-manual-submode"
                    legend="Action"
                    options={[
                      { value: 'plan', label: 'Add custom workout' },
                      { value: 'set', label: 'Log a set' },
                    ]}
                    value={manualMode}
                    onChange={setManualMode}
                  />

                  {manualMode === 'plan' ? (
                    <form onSubmit={handleAddManualExercise} className="mc-composer__form">
                      <label className="mc-field">
                        <span className="mc-field__label">Workout / Exercise name</span>
                        <input
                          type="text"
                          required
                          placeholder="e.g., Archer Push-Ups"
                          className="f-input"
                          value={manualPlanForm.name}
                          onChange={(e) => setManualPlanForm((f) => ({ ...f, name: e.target.value }))}
                        />
                      </label>

                      <div className="mc-field">
                        <span className="mc-field__label">Muscle group</span>
                        <CustomSelect
                          ariaLabel="Muscle group"
                          value={manualPlanForm.muscle_group}
                          options={[...muscleGroups, 'Cardio', 'Full Body'].map((mg) => ({
                            value: mg,
                            label: mg,
                          }))}
                          onChange={(mg) => setManualPlanForm((f) => ({ ...f, muscle_group: mg }))}
                        />
                      </div>

                      <div className="wk-triple">
                        <label className="mc-field">
                          <span className="mc-field__label">Sets</span>
                          <input
                            type="number"
                            min="1"
                            max="20"
                            className="f-input tabular"
                            value={manualPlanForm.sets}
                            onChange={(e) => setManualPlanForm((f) => ({ ...f, sets: e.target.value }))}
                          />
                        </label>
                        <label className="mc-field">
                          <span className="mc-field__label">Reps</span>
                          <input
                            type="text"
                            className="f-input tabular"
                            value={manualPlanForm.reps}
                            onChange={(e) => setManualPlanForm((f) => ({ ...f, reps: e.target.value }))}
                          />
                        </label>
                        <label className="mc-field">
                          <span className="mc-field__label">Weight (kg)</span>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            className="f-input tabular"
                            value={manualPlanForm.weight}
                            onChange={(e) => setManualPlanForm((f) => ({ ...f, weight: e.target.value }))}
                          />
                        </label>
                      </div>

                      <div className="mc-composer__actions">
                        <button type="submit" className="f-cta" disabled={busyAction}>
                          <span>Add manual workout</span>
                          <span className="f-cta__icon" aria-hidden="true">
                            <ArrowRight size={14} strokeWidth={1.75} />
                          </span>
                        </button>
                      </div>
                    </form>
                  ) : (
                    <form onSubmit={handleLogSingleSet} className="mc-composer__form">
                      <label className="mc-field">
                        <span className="mc-field__label">Exercise</span>
                        <input
                          type="text"
                          required
                          placeholder="e.g., Barbell Bench Press"
                          className="f-input"
                          value={setLogForm.exercise_name}
                          onChange={(e) =>
                            setSetLogForm((f) => ({ ...f, exercise_name: e.target.value, exercise_id: '' }))
                          }
                        />
                      </label>

                      <div className="mc-numbers">
                        <label className="mc-field">
                          <span className="mc-field__label">Weight (kg)</span>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            className="f-input tabular"
                            value={setLogForm.weight_kg}
                            onChange={(e) => setSetLogForm((f) => ({ ...f, weight_kg: e.target.value }))}
                          />
                        </label>
                        <label className="mc-field">
                          <span className="mc-field__label">Reps</span>
                          <input
                            type="number"
                            min="1"
                            max="100"
                            className="f-input tabular"
                            value={setLogForm.reps}
                            onChange={(e) => setSetLogForm((f) => ({ ...f, reps: e.target.value }))}
                          />
                        </label>
                      </div>

                      <Segmented
                        name="wk-set-type"
                        legend="Set type"
                        options={SET_TYPE_OPTIONS}
                        value={setLogForm.set_type}
                        onChange={(val) => setSetLogForm((f) => ({ ...f, set_type: val }))}
                      />

                      <div className="mc-composer__actions">
                        <button type="submit" className="f-cta" disabled={busyAction}>
                          <span>Save set</span>
                          <span className="f-cta__icon" aria-hidden="true">
                            <ArrowRight size={14} strokeWidth={1.75} />
                          </span>
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* TAB 3: Edit Day Title / Focus / Rest Toggle */}
              {composerTab === 'day' && (
                <form onSubmit={handleSaveDaySettings} className="mc-composer__form">
                  <label className="mc-field">
                    <span className="mc-field__label">{dayMeta.full} workout title</span>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Chest & Arms"
                      className="f-input"
                      value={dayForm.title}
                      onChange={(e) => setDayForm((f) => ({ ...f, title: e.target.value }))}
                    />
                  </label>

                  <label className="mc-field">
                    <span className="mc-field__label">Focus area</span>
                    <input
                      type="text"
                      placeholder="e.g., Upper Chest, Biceps & Triceps"
                      className="f-input"
                      value={dayForm.focus_area}
                      onChange={(e) => setDayForm((f) => ({ ...f, focus_area: e.target.value }))}
                    />
                  </label>

                  <Segmented
                    name="wk-day-type"
                    legend="Day type"
                    options={DAY_TYPE_OPTIONS}
                    value={dayForm.day_type}
                    onChange={(val) => setDayForm((f) => ({ ...f, day_type: val }))}
                  />

                  <div className="mc-composer__actions">
                    <button type="submit" className="f-cta" disabled={busyAction}>
                      <span>Save {dayMeta.full} settings</span>
                      <span className="f-cta__icon" aria-hidden="true">
                        <ArrowRight size={14} strokeWidth={1.75} />
                      </span>
                    </button>
                  </div>
                </form>
              )}
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
