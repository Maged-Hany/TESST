import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ArrowRight, Camera, Upload, X } from 'lucide-react';
import Segmented from './Segmented.jsx';
import { api } from '../../lib/api.js';
import { compressImageFile } from '../../lib/image.js';
import { formatDayLabel } from '../../lib/dates.js';
import { MEAL_TYPES, mealLabel } from '../../lib/meals.js';

const EMPTY_VALUES = { calories: '', protein_g: '', carbs_g: '', fat_g: '' };
const ANALYZE_TIMEOUT_MS = 45_000;

const SOURCE_COPY = {
  custom_ai: 'Foody’s estimate from your photo. Check the numbers before you add it.',
  local_preview:
    'A rough estimate from typical portions, not a reading of your photo. Edit the numbers if you know them.',
  manual: 'Enter the numbers for this meal. Only Calories are required.',
};

// stage: 'capture' (photo + name) -> 'analyzing' -> 'review' (editable numbers)
const MealComposer = forwardRef(function MealComposer(
  { date, today, mealType, onMealTypeChange, requireProfile, onSaved },
  ref
) {
  const [stage, setStage] = useState('capture');
  const [photo, setPhoto] = useState('');
  const [name, setName] = useState('');
  const [values, setValues] = useState(EMPTY_VALUES);
  const [meta, setMeta] = useState(null); // { source, note, notice }
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'error' | 'ok', text }

  const nameRef = useRef(null);
  const caloriesRef = useRef(null);
  const cameraRef = useRef(null);
  const uploadRef = useRef(null);
  const abortRef = useRef(null);
  const messageTimer = useRef(null);

  useImperativeHandle(ref, () => ({
    focus() {
      const target = stage === 'review' ? caloriesRef.current : nameRef.current;
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
  }));

  useEffect(
    () => () => {
      abortRef.current?.abort();
      clearTimeout(messageTimer.current);
    },
    []
  );

  function say(type, text) {
    clearTimeout(messageTimer.current);
    setMessage({ type, text });
    if (type === 'ok') messageTimer.current = setTimeout(() => setMessage(null), 6000);
  }

  async function addFile(file) {
    if (!file) return;
    setMessage(null);
    try {
      const compressed = await compressImageFile(file);
      setPhoto(compressed);
      // A new photo makes an earlier estimate stale, so ask for a fresh one.
      if (stage === 'review' && meta?.source !== 'manual') {
        setStage('capture');
        setMeta(null);
        say('error', 'Photo changed. Estimate again to update the numbers.');
      }
    } catch (err) {
      say('error', err.message);
    }
  }

  function onFileInput(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    addFile(file);
  }

  function onDrop(event) {
    event.preventDefault();
    setDragging(false);
    addFile(event.dataTransfer.files?.[0]);
  }

  function startManual() {
    setMessage(null);
    setMeta({ source: 'manual' });
    setStage('review');
  }

  function backToCapture() {
    setMessage(null);
    setMeta(null);
    setValues(EMPTY_VALUES);
    setStage('capture');
  }

  async function estimate() {
    if (!photo && !name.trim()) {
      say('error', 'Add a photo or type what you ate first.');
      nameRef.current?.focus();
      return;
    }
    setMessage(null);
    setStage('analyzing');

    const controller = new AbortController();
    abortRef.current = controller;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, ANALYZE_TIMEOUT_MS);

    try {
      const result = await api('/api/ai/analyze-meal', {
        method: 'POST',
        signal: controller.signal,
        body: { image_data: photo, meal_name: name.trim(), meal_type: mealType },
      });
      if (!name.trim() && result.meal_name) setName(result.meal_name);
      setValues({
        calories: String(result.calories ?? ''),
        protein_g: String(result.protein_g ?? ''),
        carbs_g: String(result.carbs_g ?? ''),
        fat_g: String(result.fat_g ?? ''),
      });
      setMeta({ source: result.source, note: result.health_note, notice: result.notice });
      setStage('review');
    } catch (err) {
      setStage('capture');
      if (err.name !== 'AbortError') {
        say('error', err.message);
      } else if (timedOut) {
        say('error', 'The estimate took too long. Try again, or enter the numbers yourself.');
      }
      // A cancel the person asked for needs no message.
    } finally {
      clearTimeout(timer);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function cancelEstimate() {
    abortRef.current?.abort();
  }

  async function save(event) {
    event.preventDefault();
    const foodName = name.trim();
    if (!foodName) {
      say('error', 'Give the meal a name before you add it.');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const num = (v) => Math.max(0, Number(v) || 0);
      const payload = await api('/api/food-logs', {
        method: 'POST',
        body: {
          date,
          meal_type: mealType,
          food_name: foodName,
          servings: 1,
          serving_size: 1,
          serving_unit: 'meal',
          calories: Math.round(num(values.calories)),
          protein_g: Number(num(values.protein_g).toFixed(1)),
          carbs_g: Number(num(values.carbs_g).toFixed(1)),
          fat_g: Number(num(values.fat_g).toFixed(1)),
          fiber_g: 0,
          notes: meta?.note || '',
          image_data: photo,
        },
      });
      onSaved(payload.summary);
      say('ok', `Added ${foodName} to ${mealLabel(mealType).toLowerCase()}.`);
      setPhoto('');
      setName('');
      setValues(EMPTY_VALUES);
      setMeta(null);
      setStage('capture');
    } catch (err) {
      say('error', err.message);
    } finally {
      setSaving(false);
    }
  }

  const setValue = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }));
  const analyzing = stage === 'analyzing';

  return (
    <section className="mc-composer f-panel" aria-labelledby="mc-composer-title">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={onFileInput} />
      <input ref={uploadRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={onFileInput} />

      <header className="mc-composer__head">
        <h2 id="mc-composer-title" className="mc-section-title">
          Log a meal
        </h2>
        <p className="mc-composer__for">For {formatDayLabel(date, today).toLowerCase()}</p>
      </header>

      <div
        className={`mc-photo ${photo ? 'has-photo' : ''} ${dragging ? 'is-dragging' : ''} ${analyzing ? 'is-scanning' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {photo ? (
          <>
            <img src={photo} alt="Your meal" className="mc-photo__img" />
            {!analyzing && (
              <button type="button" className="mc-photo__clear" aria-label="Remove photo" onClick={() => setPhoto('')}>
                <X size={14} />
              </button>
            )}
          </>
        ) : (
          <div className="mc-photo__empty">
            <Camera size={22} strokeWidth={1.3} aria-hidden="true" />
            <p>Add a photo, or drop one here</p>
          </div>
        )}
      </div>

      {!analyzing && (
        <div className="mc-photo__actions">
          <button type="button" className="f-btn-secondary" onClick={() => cameraRef.current?.click()}>
            <Camera size={14} strokeWidth={1.6} aria-hidden="true" />
            <span>{photo ? 'Retake' : 'Take photo'}</span>
          </button>
          <button type="button" className="f-btn-secondary" onClick={() => uploadRef.current?.click()}>
            <Upload size={14} strokeWidth={1.6} aria-hidden="true" />
            <span>{photo ? 'Choose another' : 'Upload'}</span>
          </button>
        </div>
      )}

      <form className="mc-composer__form" onSubmit={save} noValidate={stage !== 'review'}>
        <label className="mc-field">
          <span className="mc-field__label">What did you eat?</span>
          <input
            ref={nameRef}
            type="text"
            className="f-input"
            maxLength={120}
            placeholder="Grilled chicken and rice"
            value={name}
            disabled={analyzing || saving}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && stage === 'capture') {
                e.preventDefault();
                requireProfile(estimate);
              }
            }}
          />
        </label>

        <Segmented
          name="meal-type"
          legend="Meal time"
          options={MEAL_TYPES}
          value={mealType}
          onChange={onMealTypeChange}
        />

        {stage === 'capture' && (
          <div className="mc-composer__actions">
            <button type="button" className="f-cta" onClick={() => requireProfile(estimate)}>
              <span>Estimate with Foody</span>
              <span className="f-cta__icon" aria-hidden="true">
                <ArrowRight size={14} strokeWidth={1.75} />
              </span>
            </button>
            <button type="button" className="f-btn-secondary" onClick={startManual}>
              Enter numbers myself
            </button>
          </div>
        )}

        {analyzing && (
          <div className="mc-composer__actions">
            <p className="mc-composer__busy" role="status">
              Reading your meal…
            </p>
            <button type="button" className="f-btn-secondary" onClick={cancelEstimate}>
              Cancel
            </button>
          </div>
        )}

        {stage === 'review' && (
          <>
            <p className="mc-composer__source">{SOURCE_COPY[meta?.source] || SOURCE_COPY.manual}</p>
            {meta?.notice && <p className="mc-composer__source">{meta.notice}</p>}

            <div className="mc-numbers">
              <label className="mc-field">
                <span className="mc-field__label">Calories</span>
                <input
                  ref={caloriesRef}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="20000"
                  required
                  className="f-input tabular"
                  placeholder="0"
                  value={values.calories}
                  onChange={setValue('calories')}
                />
              </label>
              {[
                ['protein_g', 'Protein (g)'],
                ['carbs_g', 'Carbs (g)'],
                ['fat_g', 'Fat (g)'],
              ].map(([key, label]) => (
                <label className="mc-field" key={key}>
                  <span className="mc-field__label">{label}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min="0"
                    max="2000"
                    className="f-input tabular"
                    placeholder="0"
                    value={values[key]}
                    onChange={setValue(key)}
                  />
                </label>
              ))}
            </div>

            {meta?.note && <p className="mc-health-note">{meta.note}</p>}

            <div className="mc-composer__actions">
              <button type="submit" className="f-cta" disabled={saving}>
                <span>{saving ? 'Adding' : `Add to ${formatDayLabel(date, today).toLowerCase()}`}</span>
                <span className="f-cta__icon" aria-hidden="true">
                  <ArrowRight size={14} strokeWidth={1.75} />
                </span>
              </button>
              <button type="button" className="f-btn-secondary" disabled={saving} onClick={backToCapture}>
                Start over
              </button>
            </div>
          </>
        )}
      </form>

      <div className="mc-composer__messages">
        {message?.type === 'error' && (
          <p className="mc-composer__error" role="alert">
            {message.text}
          </p>
        )}
        <p className="mc-composer__ok" role="status">
          {message?.type === 'ok' ? message.text : ''}
        </p>
      </div>
    </section>
  );
});

export default MealComposer;
