import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Plus, Trash2, X } from 'lucide-react';
import CustomSelect from '../components/CustomSelect.jsx';
import Segmented from '../components/calories/Segmented.jsx';
import { api } from '../lib/api.js';
import { toDateString } from '../lib/dates.js';
import { MEAL_TYPES, formatNumber, mealLabel } from '../lib/meals.js';

const WEEKDAYS = [
  { key: 'monday', short: 'Mon', label: 'Monday' },
  { key: 'tuesday', short: 'Tue', label: 'Tuesday' },
  { key: 'wednesday', short: 'Wed', label: 'Wednesday' },
  { key: 'thursday', short: 'Thu', label: 'Thursday' },
  { key: 'friday', short: 'Fri', label: 'Friday' },
  { key: 'saturday', short: 'Sat', label: 'Saturday' },
  { key: 'sunday', short: 'Sun', label: 'Sunday' },
];

const SOURCE_MODES = [
  { value: 'catalog', label: 'Saved foods' },
  { value: 'custom', label: 'Custom meal' },
];

function todayWeekdayKey() {
  const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return names[new Date().getDay()];
}

function PlannedMacro({ label, value, target }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const over = target > 0 && value > target;
  const diff = Math.abs(Math.round(target - value));

  return (
    <div className={`mc-macro ${over ? 'is-over' : ''}`}>
      <div className="mc-macro__head">
        <span className="mc-macro__name">{label}</span>
        <span className="mc-macro__state">{over ? `${diff} g over` : `${diff} g left`}</span>
      </div>
      <div className="mc-macro__track">
        <span className="mc-macro__fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="mc-macro__figures tabular">
        <strong>{Math.round(value)}</strong> of {target} g
      </p>
    </div>
  );
}

function PlannedMealRow({ item, onLogToday, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirmDelete() {
    setBusy(true);
    try {
      await onDelete(item.id);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <li className="mc-row mp-row">
      <div className="mc-row__main">
        <h4 className="mc-row__name">{item.meal_name}</h4>
        <p className="mc-row__macros tabular">
          <span>
            <strong>{Math.round(item.protein_g)}</strong> g protein
          </span>
          <span>
            <strong>{Math.round(item.carbs_g)}</strong> g carbs
          </span>
          <span>
            <strong>{Math.round(item.fat_g)}</strong> g fat
          </span>
          {item.prep_notes && <span>· {item.prep_notes}</span>}
        </p>
      </div>

      <p className="mc-row__cal tabular">{formatNumber(item.calories)}</p>

      <div className="mc-row__actions mp-row__actions">
        <button
          type="button"
          className="mc-text-link mp-log-btn"
          onClick={() => onLogToday(item.id)}
        >
          {item.is_completed ? (
            <span className="mp-logged">
              <Check size={12} strokeWidth={2.2} aria-hidden="true" />
              <span>Logged</span>
            </span>
          ) : (
            'Log today'
          )}
        </button>

        {confirming ? (
          <>
            <button type="button" className="mc-danger-link" disabled={busy} onClick={confirmDelete}>
              {busy ? 'Deleting' : 'Delete'}
            </button>
            <button type="button" className="mc-text-link" disabled={busy} onClick={() => setConfirming(false)}>
              Keep
            </button>
          </>
        ) : (
          <button
            type="button"
            className="mc-icon-btn mc-icon-btn--quiet"
            aria-label={`Delete ${item.meal_name}`}
            onClick={() => setConfirming(true)}
          >
            <Trash2 size={15} strokeWidth={1.6} />
          </button>
        )}
      </div>
    </li>
  );
}

export default function MealPlan({ user }) {
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [feedback, setFeedback] = useState('');

  const [selectedDay, setSelectedDay] = useState(todayWeekdayKey);
  const [planData, setPlanData] = useState(null);
  const [foods, setFoods] = useState([]);

  // Composer state
  const [mealType, setMealType] = useState('lunch');
  const [sourceMode, setSourceMode] = useState('catalog');
  const [selectedFoodId, setSelectedFoodId] = useState('');
  const [servings, setServings] = useState('1');
  const [customForm, setCustomForm] = useState({
    meal_name: '',
    calories: '',
    protein_g: '',
    carbs_g: '',
    fat_g: '',
  });
  const [prepNotes, setPrepNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const loadMealPlans = useCallback(async () => {
    setLoading(true);
    setNotice('');
    try {
      const [mpRes, foodsRes] = await Promise.all([
        api('/api/meal-plans'),
        api('/api/foods'),
      ]);
      setPlanData(mpRes);
      const list = foodsRes?.items || [];
      setFoods(list);
      if (list[0]) {
        setSelectedFoodId(String(list[0].id));
      }
    } catch (err) {
      setNotice(err.message || 'Could not load weekly meal plan.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMealPlans();
  }, [loadMealPlans, user?.id]);

  const targets = planData?.targets || { calories: 2290, protein_g: 200, carbs_g: 229, fat_g: 64 };
  const dayData = planData?.days?.[selectedDay] || {
    items: [],
    meals: { breakfast: [], lunch: [], dinner: [], snack: [] },
    totals: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  };
  const dayInfo = WEEKDAYS.find((w) => w.key === selectedDay) || WEEKDAYS[0];

  const chosenFood = useMemo(
    () => foods.find((f) => String(f.id) === String(selectedFoodId)) || foods[0] || null,
    [foods, selectedFoodId]
  );

  const mult = Math.max(0.1, Number(servings) || 1);
  const previewCalories = chosenFood ? Math.round(chosenFood.calories * mult) : 0;
  const previewProtein = chosenFood ? Math.round(chosenFood.protein_g * mult) : 0;

  async function refreshPlansQuietly() {
    const mpRes = await api('/api/meal-plans');
    setPlanData(mpRes);
  }

  async function handleAddPlannedMeal(e) {
    e.preventDefault();
    setBusy(true);
    setNotice('');
    setFeedback('');
    try {
      const body =
        sourceMode === 'catalog' && chosenFood
          ? {
              day_of_week: selectedDay,
              meal_type: mealType,
              food_id: chosenFood.id,
              servings: mult,
              prep_notes: prepNotes.trim(),
            }
          : {
              day_of_week: selectedDay,
              meal_type: mealType,
              meal_name: customForm.meal_name.trim(),
              servings: 1,
              serving_unit: 'meal',
              calories: Math.max(0, Math.round(Number(customForm.calories) || 0)),
              protein_g: Math.max(0, Number(customForm.protein_g) || 0),
              carbs_g: Math.max(0, Number(customForm.carbs_g) || 0),
              fat_g: Math.max(0, Number(customForm.fat_g) || 0),
              prep_notes: prepNotes.trim(),
            };

      await api('/api/meal-plans', { method: 'POST', body });
      await refreshPlansQuietly();
      setPrepNotes('');
      setCustomForm({ meal_name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '' });
      setFeedback(`Added to ${dayInfo.label}.`);
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogSinglePlannedMeal(id) {
    setNotice('');
    setFeedback('');
    try {
      await api(`/api/meal-plans/${id}/log`, {
        method: 'POST',
        body: { date: toDateString() },
      });
      await refreshPlansQuietly();
      setFeedback('Logged to today’s My Calories.');
    } catch (err) {
      setNotice(err.message);
    }
  }

  async function handleLogEntireDay() {
    setBusy(true);
    setNotice('');
    setFeedback('');
    try {
      const res = await api(`/api/meal-plans/day/${selectedDay}/log-all`, {
        method: 'POST',
        body: { date: toDateString() },
      });
      await refreshPlansQuietly();
      setFeedback(`Logged ${res.logged_count} planned meals to today’s My Calories.`);
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeletePlannedMeal(id) {
    setNotice('');
    try {
      await api(`/api/meal-plans/${id}`, { method: 'DELETE' });
      await refreshPlansQuietly();
    } catch (err) {
      setNotice(err.message);
    }
  }

  const diff = targets.calories - dayData.totals.calories;
  const over = diff < 0;
  const scale = Math.max(targets.calories, dayData.totals.calories, 1);
  const targetPct = (targets.calories / scale) * 100;
  const overPct = over ? ((dayData.totals.calories - targets.calories) / scale) * 100 : 0;

  const slotTotals = MEAL_TYPES.map(({ value }) => ({
    type: value,
    calories: (dayData.meals[value] || []).reduce((s, x) => s + Number(x.calories || 0), 0),
  })).filter((t) => t.calories > 0);

  return (
    <div className="page-shell mc">
      <div className="page-shell__beam" aria-hidden="true" />

      <div className="mc-container">
        <header className="mc-top">
          <h1 className="mc-title">Meal Plan</h1>
        </header>

        {/* 7-Day Weekly Meal Plan Strip */}
        {!loading && planData && (
          <nav className="mc-week" aria-label="Choose day of week">
            <div className="mc-week__bar">
              <span>Monday to Sunday · Weekly meal blueprint</span>
              <span className="tabular">Daily target · {formatNumber(targets.calories)} Calories</span>
            </div>
            <ul className="mc-week__days">
              {WEEKDAYS.map((w) => {
                const dObj = planData.days?.[w.key];
                const cals = dObj?.totals?.calories || 0;
                const pct = targets.calories ? Math.min(100, (cals / targets.calories) * 100) : 0;
                const dayOver = targets.calories && cals > targets.calories;
                const selected = w.key === selectedDay;

                return (
                  <li key={w.key}>
                    <button
                      type="button"
                      className={`mc-day ${selected ? 'is-selected' : ''} ${dayOver ? 'is-over' : ''}`}
                      aria-pressed={selected}
                      onClick={() => {
                        setSelectedDay(w.key);
                        setFeedback('');
                      }}
                    >
                      <span className="mc-day__name">{w.short}</span>
                      <span className="wk-day__tag tabular">{cals ? formatNumber(cals) : '—'}</span>
                      <span className="mc-day__meter" aria-hidden="true">
                        <span style={{ width: `${pct}%` }} />
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
            <button type="button" className="mc-icon-btn" aria-label="Dismiss message" onClick={() => setNotice('')}>
              <X size={14} />
            </button>
          </div>
        )}

        <div className="mc-layout">
          {loading ? (
            <section className="mc-budget" aria-busy="true" aria-label="Loading meal plan">
              <div className="sk sk--hero" />
              <div className="sk sk--bar" />
              <div className="mc-macros">
                <div className="sk sk--macro" />
                <div className="sk sk--macro" />
                <div className="sk sk--macro" />
              </div>
            </section>
          ) : (
            <div className="wk-main">
              {/* Planned Day Summary + 44px Segmented Bar + 3 Full-Word Macro Meters */}
              <section className="mc-budget">
                <div className={`mc-remaining ${over ? 'is-over' : ''}`}>
                  <p className="mc-remaining__num tabular">{formatNumber(dayData.totals.calories)}</p>
                  <p className="mc-remaining__label">
                    Calories planned for {dayInfo.label} ·{' '}
                    <strong className="wk-strong tabular">
                      {formatNumber(Math.abs(diff))} Calories {over ? 'over' : 'under'}
                    </strong>{' '}
                    your {formatNumber(targets.calories)} target
                  </p>
                </div>

                {dayData.items.length > 0 && (
                  <p className="mc-budget__summary">
                    <button
                      type="button"
                      className="mc-text-link"
                      disabled={busy}
                      onClick={handleLogEntireDay}
                    >
                      Log entire {dayInfo.label} plan to My Calories &rarr;
                    </button>
                    {feedback && <span className="mp-feedback"> · {feedback}</span>}
                  </p>
                )}

                <div className="mc-daybar">
                  <div className="mc-daybar__track">
                    <div className="mc-daybar__segments" key={selectedDay}>
                      {slotTotals.map((t, i) => (
                        <span
                          key={t.type}
                          className={`mc-daybar__seg mc-swatch--${t.type}`}
                          style={{ width: `${(t.calories / scale) * 100}%`, '--i': i }}
                        />
                      ))}
                    </div>
                    {overPct > 0 && (
                      <span
                        className="mc-daybar__over"
                        style={{ left: `${targetPct}%`, width: `${overPct}%` }}
                      />
                    )}
                    <span className="mc-daybar__tick" style={{ left: `${targetPct}%` }} />
                  </div>
                  <p className="mc-daybar__target tabular" style={{ '--at': `${targetPct}%` }}>
                    Target {formatNumber(targets.calories)}
                  </p>

                  {slotTotals.length > 0 ? (
                    <ul className="mc-daybar__legend">
                      {slotTotals.map((t) => (
                        <li key={t.type}>
                          <span className={`mc-swatch mc-swatch--${t.type}`} aria-hidden="true" />
                          {mealLabel(t.type)}{' '}
                          <strong className="tabular">{formatNumber(t.calories)}</strong>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mc-daybar__empty">
                      No meals planned for {dayInfo.label} yet. Use the form on the right to plan
                      your day.
                    </p>
                  )}
                </div>

                <div className="mc-macros">
                  <PlannedMacro
                    label="Protein"
                    value={dayData.totals.protein_g}
                    target={targets.protein_g}
                  />
                  <PlannedMacro
                    label="Carbs"
                    value={dayData.totals.carbs_g}
                    target={targets.carbs_g}
                  />
                  <PlannedMacro
                    label="Fat"
                    value={dayData.totals.fat_g}
                    target={targets.fat_g}
                  />
                </div>
              </section>

              {/* Open Hairline Planned Meal Groups */}
              <section className="mc-log" aria-labelledby="mp-log-title">
                <h2 id="mp-log-title" className="mc-section-title">
                  Planned meals for {dayInfo.label}
                </h2>

                {MEAL_TYPES.map(({ value, label }) => {
                  const items = dayData.meals[value] || [];
                  const subtotal = items.reduce((s, i) => s + Number(i.calories || 0), 0);

                  return (
                    <div key={value} className="mc-group">
                      <div className="mc-group__head">
                        <span className={`mc-swatch mc-swatch--${value}`} aria-hidden="true" />
                        <h3 className="mc-group__title">{label}</h3>
                        <p className="mc-group__total tabular">
                          {items.length > 0 ? `${formatNumber(subtotal)} Calories` : ''}
                        </p>
                        <button
                          type="button"
                          className="mc-add"
                          onClick={() => setMealType(value)}
                        >
                          <Plus size={14} strokeWidth={1.8} aria-hidden="true" />
                          <span>Plan</span>
                        </button>
                      </div>

                      {items.length > 0 && (
                        <ul className="mc-rows">
                          {items.map((item) => (
                            <PlannedMealRow
                              key={item.id}
                              item={item}
                              onLogToday={handleLogSinglePlannedMeal}
                              onDelete={handleDeletePlannedMeal}
                            />
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </section>
            </div>
          )}

          {/* RIGHT STICKY COMPOSER: Plan a Meal */}
          <div className="mc-composer-slot">
            <aside className="f-panel mc-composer">
              <div className="mc-composer__head">
                <h2 className="mc-section-title">Plan a meal</h2>
                <p className="mc-composer__for">for {dayInfo.label}</p>
              </div>

              <form onSubmit={handleAddPlannedMeal} className="mc-composer__form">
                <Segmented
                  name="mp-meal-type"
                  legend="Meal time"
                  options={MEAL_TYPES}
                  value={mealType}
                  onChange={setMealType}
                />

                <Segmented
                  name="mp-source-mode"
                  legend="Source"
                  options={SOURCE_MODES}
                  value={sourceMode}
                  onChange={setSourceMode}
                />

                {sourceMode === 'catalog' ? (
                  <>
                    <div className="mc-field">
                      <span className="mc-field__label">Food item</span>
                      <CustomSelect
                        ariaLabel="Food item"
                        value={String(selectedFoodId)}
                        options={foods.map((f) => ({
                          value: String(f.id),
                          label: f.name,
                          sub: `${f.calories} cal`,
                          display: `${f.name} (${f.calories} cal)`,
                        }))}
                        onChange={setSelectedFoodId}
                      />
                    </div>

                    <div className="mp-servings-row">
                      <label className="mc-field">
                        <span className="mc-field__label">Servings</span>
                        <input
                          type="number"
                          step="0.25"
                          min="0.25"
                          max="20"
                          className="f-input tabular"
                          value={servings}
                          onChange={(e) => setServings(e.target.value)}
                        />
                      </label>
                      {chosenFood && (
                        <p className="mp-servings-preview tabular">
                          <strong>{previewCalories}</strong> Calories · {previewProtein} g protein
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <label className="mc-field">
                      <span className="mc-field__label">Meal name</span>
                      <input
                        type="text"
                        required
                        placeholder="e.g., Grilled Turkey & Quinoa"
                        className="f-input"
                        value={customForm.meal_name}
                        onChange={(e) => setCustomForm((f) => ({ ...f, meal_name: e.target.value }))}
                      />
                    </label>

                    <div className="mc-numbers">
                      <label className="mc-field">
                        <span className="mc-field__label">Calories</span>
                        <input
                          type="number"
                          min="0"
                          required
                          placeholder="0"
                          className="f-input tabular"
                          value={customForm.calories}
                          onChange={(e) => setCustomForm((f) => ({ ...f, calories: e.target.value }))}
                        />
                      </label>
                      <label className="mc-field">
                        <span className="mc-field__label">Protein (g)</span>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          placeholder="0"
                          className="f-input tabular"
                          value={customForm.protein_g}
                          onChange={(e) => setCustomForm((f) => ({ ...f, protein_g: e.target.value }))}
                        />
                      </label>
                      <label className="mc-field">
                        <span className="mc-field__label">Carbs (g)</span>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          placeholder="0"
                          className="f-input tabular"
                          value={customForm.carbs_g}
                          onChange={(e) => setCustomForm((f) => ({ ...f, carbs_g: e.target.value }))}
                        />
                      </label>
                      <label className="mc-field">
                        <span className="mc-field__label">Fat (g)</span>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          placeholder="0"
                          className="f-input tabular"
                          value={customForm.fat_g}
                          onChange={(e) => setCustomForm((f) => ({ ...f, fat_g: e.target.value }))}
                        />
                      </label>
                    </div>
                  </>
                )}

                <label className="mc-field">
                  <span className="mc-field__label">Prep note (optional)</span>
                  <input
                    type="text"
                    placeholder="e.g., Marinate night before"
                    className="f-input"
                    value={prepNotes}
                    onChange={(e) => setPrepNotes(e.target.value)}
                  />
                </label>

                <div className="mc-composer__actions">
                  <button type="submit" className="f-cta" disabled={busy}>
                    <span>{busy ? 'Saving...' : `Add to ${dayInfo.label}`}</span>
                    <span className="f-cta__icon" aria-hidden="true">
                      <ArrowRight size={14} strokeWidth={1.75} />
                    </span>
                  </button>
                </div>
              </form>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
