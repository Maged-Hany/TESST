import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Camera, ChevronLeft, ChevronRight, Trash2, Upload, X } from 'lucide-react';
import CustomSelect from '../components/CustomSelect.jsx';

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

const ACTIVITY_OPTIONS = [
  { value: 'sedentary', label: 'Sedentary', sub: 'little to no exercise', display: 'Sedentary (little to no exercise)' },
  { value: 'light', label: 'Light', sub: '1–3 days/week', display: 'Light (1–3 days/week)' },
  { value: 'moderate', label: 'Moderate', sub: '3–5 days/week', display: 'Moderate (3–5 days/week)' },
  { value: 'active', label: 'Active', sub: '6–7 days/week', display: 'Active (6–7 days/week)' },
  { value: 'very_active', label: 'Very Active', sub: 'intense daily training', display: 'Very Active (intense daily training)' },
];

const GOAL_OPTIONS = [
  { value: 'cut', label: 'Lose Fat', sub: 'calorie deficit', display: 'Lose Fat' },
  { value: 'maintain', label: 'Maintain Weight', sub: 'balanced intake', display: 'Maintain Weight' },
  { value: 'bulk', label: 'Build Muscle', sub: 'lean surplus', display: 'Build Muscle' },
];

const MEAL_TYPES = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

function getLocalDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function shiftDateString(dateStr, deltaDays) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return getLocalDateString(dt);
}

function formatReadableDate(dateStr) {
  const todayStr = getLocalDateString();
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const short = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (dateStr === todayStr) return `Today, ${short}`;
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatMealType(type) {
  const found = MEAL_TYPES.find((m) => m.value === type);
  return found ? found.label : 'Meal';
}

function compressImageFile(file, maxDimension = 960, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected photo.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Unsupported image format.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function MyCalories() {
  const [selectedDate, setSelectedDate] = useState(getLocalDateString);
  const [loadingPage, setLoadingPage] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  // Profile & body info state
  const [profile, setProfile] = useState(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    weight_kg: 78.5,
    height_cm: 178,
    age: 27,
    gender: 'male',
    activity_level: 'moderate',
    goal: 'cut',
    health_notes: '',
  });

  // Daily nutrition & meal library state
  const [dailyData, setDailyData] = useState(null);

  // Capture / AI / Manual workflow state
  // mode: 'capture' | 'analyzing' | 'ai_result' | 'manual'
  const [entryMode, setEntryMode] = useState('capture');
  const [photoData, setPhotoData] = useState('');
  const [mealName, setMealName] = useState('');
  const [mealType, setMealType] = useState('lunch');
  const [aiResult, setAiResult] = useState(null);
  const [manualForm, setManualForm] = useState({
    calories: '',
    protein_g: '',
    carbs_g: '',
    fat_g: '',
  });
  const [savingMeal, setSavingMeal] = useState(false);
  const [pendingSendAfterProfile, setPendingSendAfterProfile] = useState(false);

  const cameraInputRef = useRef(null);
  const uploadInputRef = useRef(null);

  const loadPageData = useCallback(async (dateStr) => {
    setLoadingPage(true);
    setErrorMessage('');
    try {
      const [profileRes, logsRes] = await Promise.all([
        fetch('/api/profile'),
        fetch(`/api/food-logs?date=${encodeURIComponent(dateStr)}`),
      ]);
      if (!profileRes.ok || !logsRes.ok) {
        throw new Error('Could not load nutrition data.');
      }
      const [profileJson, logsJson] = await Promise.all([
        profileRes.json(),
        logsRes.json(),
      ]);

      setProfile(profileJson);
      setProfileForm({
        weight_kg: profileJson.weight_kg ?? 78.5,
        height_cm: profileJson.height_cm ?? 178,
        age: profileJson.age ?? 27,
        gender: profileJson.gender || 'male',
        activity_level: profileJson.activity_level || 'moderate',
        goal: profileJson.goal || 'cut',
        health_notes: profileJson.health_notes || '',
      });
      if (!profileJson.profile_completed) {
        setEditingProfile(true);
      }
      setDailyData(logsJson);
    } catch (err) {
      setErrorMessage(err.message || 'Unable to connect to the Foody server.');
    } finally {
      setLoadingPage(false);
    }
  }, []);

  useEffect(() => {
    loadPageData(selectedDate);
  }, [selectedDate, loadPageData]);

  async function handlePhotoSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setErrorMessage('');
    try {
      const compressed = await compressImageFile(file);
      setPhotoData(compressed);
      if (entryMode === 'ai_result') {
        setEntryMode('capture');
        setAiResult(null);
      }
    } catch (err) {
      setErrorMessage(err.message || 'Could not process the meal photo.');
    }
  }

  async function runSendToFoody(activeProfile) {
    setErrorMessage('');
    setEntryMode('analyzing');
    try {
      const res = await fetch('/api/ai/analyze-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_data: photoData,
          meal_name: mealName.trim(),
          meal_type: mealType,
          profile: activeProfile || profile,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || 'Could not analyze meal.');
      }
      const result = await res.json();
      setAiResult(result);
      if (!mealName.trim() && result.meal_name) {
        setMealName(result.meal_name);
      }
      setManualForm({
        calories: String(result.calories ?? ''),
        protein_g: String(result.protein_g ?? ''),
        carbs_g: String(result.carbs_g ?? ''),
        fat_g: String(result.fat_g ?? ''),
      });
      setEntryMode('ai_result');
    } catch (err) {
      setErrorMessage(err.message || 'Failed to send meal to Foody.');
      setEntryMode('capture');
    }
  }

  async function handleSaveProfile(e) {
    e.preventDefault();
    setSavingProfile(true);
    setErrorMessage('');
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weight_kg: Number(profileForm.weight_kg),
          height_cm: Number(profileForm.height_cm),
          age: Number(profileForm.age),
          gender: profileForm.gender,
          activity_level: profileForm.activity_level,
          goal: profileForm.goal,
          health_notes: profileForm.health_notes,
          recalculate_targets: true,
          profile_completed: true,
        }),
      });
      if (!res.ok) throw new Error('Could not save your body profile.');
      const updated = await res.json();
      setProfile(updated);
      setEditingProfile(false);

      // Refresh daily targets immediately
      const logsRes = await fetch(`/api/food-logs?date=${encodeURIComponent(selectedDate)}`);
      if (logsRes.ok) {
        setDailyData(await logsRes.json());
      }

      if (pendingSendAfterProfile) {
        setPendingSendAfterProfile(false);
        await runSendToFoody(updated);
      }
    } catch (err) {
      setErrorMessage(err.message || 'Could not save body profile.');
    } finally {
      setSavingProfile(false);
    }
  }

  function handleSendToFoodyClick() {
    if (!photoData && !mealName.trim()) {
      setErrorMessage('Take a photo or enter a meal name first.');
      return;
    }
    if (!profile?.profile_completed) {
      setPendingSendAfterProfile(true);
      setEditingProfile(true);
      return;
    }
    runSendToFoody(profile);
  }

  function handleSwitchToManual() {
    setErrorMessage('');
    if (aiResult) {
      setManualForm({
        calories: String(aiResult.calories ?? ''),
        protein_g: String(aiResult.protein_g ?? ''),
        carbs_g: String(aiResult.carbs_g ?? ''),
        fat_g: String(aiResult.fat_g ?? ''),
      });
    }
    setEntryMode('manual');
  }

  async function saveMealToLibrary({ name, calories, protein_g, carbs_g, fat_g, notes = '' }) {
    if (!String(name || '').trim()) {
      setErrorMessage('Enter a meal name before saving.');
      return;
    }
    setSavingMeal(true);
    setErrorMessage('');
    try {
      const res = await fetch('/api/food-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          meal_type: mealType,
          food_name: String(name).trim(),
          servings: 1,
          serving_size: 1,
          serving_unit: 'meal',
          calories: Math.max(0, Math.round(Number(calories) || 0)),
          protein_g: Math.max(0, Number(protein_g) || 0),
          carbs_g: Math.max(0, Number(carbs_g) || 0),
          fat_g: Math.max(0, Number(fat_g) || 0),
          fiber_g: 0,
          notes,
          image_data: photoData,
        }),
      });
      if (!res.ok) throw new Error('Could not save meal.');
      const payload = await res.json();
      setDailyData(payload.summary);

      // Reset capture workspace cleanly
      setPhotoData('');
      setMealName('');
      setAiResult(null);
      setManualForm({ calories: '', protein_g: '', carbs_g: '', fat_g: '' });
      setEntryMode('capture');
    } catch (err) {
      setErrorMessage(err.message || 'Failed to save meal.');
    } finally {
      setSavingMeal(false);
    }
  }

  async function handleDeleteMeal(logId) {
    setErrorMessage('');
    try {
      const res = await fetch(`/api/food-logs/${logId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not delete meal.');
      const payload = await res.json();
      setDailyData(payload.summary);
    } catch (err) {
      setErrorMessage(err.message || 'Could not delete meal.');
    }
  }

  const consumed = dailyData?.consumed || { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  const targets = dailyData?.targets || { calories: 2290, protein_g: 200, carbs_g: 229, fat_g: 64 };
  const remainingCalories = Math.max(0, targets.calories - consumed.calories);
  const mealItems = dailyData?.items || [];

  const proteinPct = Math.min(100, targets.protein_g ? Math.round((consumed.protein_g / targets.protein_g) * 100) : 0);
  const carbsPct = Math.min(100, targets.carbs_g ? Math.round((consumed.carbs_g / targets.carbs_g) * 100) : 0);
  const fatPct = Math.min(100, targets.fat_g ? Math.round((consumed.fat_g / targets.fat_g) * 100) : 0);

  return (
    <div className="page-shell">
      <div className="page-shell__beam" aria-hidden="true" />

      {/* Hidden Native Phone Camera & Upload Inputs (Zero Custom Camera UI) */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={handlePhotoSelected}
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handlePhotoSelected}
      />

      <div className="mc-container">
        {/* 1. HEADER & DAILY TOTALS */}
        <section className="mc-header">
          <div className="mc-header__left">
            <h1 className="mc-title">My Calories</h1>
            <div className="mc-subbar">
              <div className="mc-date-nav">
                <button
                  type="button"
                  className="mc-icon-btn"
                  aria-label="Previous day"
                  onClick={() => setSelectedDate((prev) => shiftDateString(prev, -1))}
                >
                  <ChevronLeft size={14} strokeWidth={1.75} />
                </button>
                <span className="mc-date-label">{formatReadableDate(selectedDate)}</span>
                <button
                  type="button"
                  className="mc-icon-btn"
                  aria-label="Next day"
                  onClick={() => setSelectedDate((prev) => shiftDateString(prev, 1))}
                >
                  <ChevronRight size={14} strokeWidth={1.75} />
                </button>
              </div>

              <button
                type="button"
                className="mc-text-link"
                onClick={() => setEditingProfile((prev) => !prev)}
              >
                {editingProfile ? 'Close body info' : 'Edit body info'}
              </button>
            </div>
          </div>

          {/* Uses :empty::after dark shimmer skeleton while loading */}
          <div className="mc-header__right skeleton-totals">
            {!loadingPage && dailyData && (
              <>
                <div className="mc-calories-row">
                  <div className="mc-calories-main">
                    <span className="mc-calories-num tabular">
                      {consumed.calories.toLocaleString()}
                    </span>
                    <span className="mc-calories-target tabular">
                      / {targets.calories.toLocaleString()} Calories
                    </span>
                  </div>
                  <span className="mc-calories-left tabular">
                    {remainingCalories.toLocaleString()} Calories left
                  </span>
                </div>

                <div className="mc-macro-bars">
                  <div className="mc-bar">
                    <div className="mc-bar__meta">
                      <span>Protein</span>
                      <span className="mc-bar__val tabular">
                        {Math.round(consumed.protein_g)} / {targets.protein_g} g
                      </span>
                    </div>
                    <div className="mc-bar__track">
                      <div className="mc-bar__fill" style={{ width: `${proteinPct}%` }} />
                    </div>
                  </div>

                  <div className="mc-bar">
                    <div className="mc-bar__meta">
                      <span>Carbs</span>
                      <span className="mc-bar__val tabular">
                        {Math.round(consumed.carbs_g)} / {targets.carbs_g} g
                      </span>
                    </div>
                    <div className="mc-bar__track">
                      <div className="mc-bar__fill" style={{ width: `${carbsPct}%` }} />
                    </div>
                  </div>

                  <div className="mc-bar">
                    <div className="mc-bar__meta">
                      <span>Fat</span>
                      <span className="mc-bar__val tabular">
                        {Math.round(consumed.fat_g)} / {targets.fat_g} g
                      </span>
                    </div>
                    <div className="mc-bar__track">
                      <div className="mc-bar__fill" style={{ width: `${fatPct}%` }} />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        {errorMessage && (
          <div className="mc-error" role="alert">
            <span>{errorMessage}</span>
            <button
              type="button"
              className="mc-icon-btn"
              aria-label="Dismiss message"
              onClick={() => setErrorMessage('')}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* 2. BODY & HEALTH PROFILE STEP (Shown before first AI send or when editing) */}
        {!loadingPage && editingProfile && (
          <section className="f-panel mc-profile">
            <div className="mc-profile__head">
              <h2 className="mc-section-title">Your Body Profile</h2>
              <p className="mc-section-copy">
                Share your body details first so Foody AI knows your daily needs and what keeps you healthy.
              </p>
            </div>

            <form onSubmit={handleSaveProfile} className="mc-profile__form">
              <div className="mc-profile__grid">
                <label className="mc-field">
                  <span className="mc-field__label">Weight (kg)</span>
                  <input
                    type="number"
                    step="0.1"
                    min="25"
                    max="300"
                    required
                    className="f-input tabular"
                    value={profileForm.weight_kg}
                    onChange={(e) => setProfileForm((p) => ({ ...p, weight_kg: e.target.value }))}
                  />
                </label>

                <label className="mc-field">
                  <span className="mc-field__label">Height (cm)</span>
                  <input
                    type="number"
                    step="0.5"
                    min="100"
                    max="250"
                    required
                    className="f-input tabular"
                    value={profileForm.height_cm}
                    onChange={(e) => setProfileForm((p) => ({ ...p, height_cm: e.target.value }))}
                  />
                </label>

                <label className="mc-field">
                  <span className="mc-field__label">Age</span>
                  <input
                    type="number"
                    min="13"
                    max="100"
                    required
                    className="f-input tabular"
                    value={profileForm.age}
                    onChange={(e) => setProfileForm((p) => ({ ...p, age: e.target.value }))}
                  />
                </label>

                <div className="mc-field">
                  <span className="mc-field__label">Gender</span>
                  <CustomSelect
                    ariaLabel="Gender"
                    value={profileForm.gender}
                    options={GENDER_OPTIONS}
                    onChange={(val) => setProfileForm((p) => ({ ...p, gender: val }))}
                  />
                </div>

                <div className="mc-field mc-field--span2">
                  <span className="mc-field__label">Activity Level</span>
                  <CustomSelect
                    ariaLabel="Activity Level"
                    value={profileForm.activity_level}
                    options={ACTIVITY_OPTIONS}
                    onChange={(val) => setProfileForm((p) => ({ ...p, activity_level: val }))}
                  />
                </div>

                <div className="mc-field mc-field--span2">
                  <span className="mc-field__label">Goal</span>
                  <CustomSelect
                    ariaLabel="Goal"
                    value={profileForm.goal}
                    options={GOAL_OPTIONS}
                    onChange={(val) => setProfileForm((p) => ({ ...p, goal: val }))}
                  />
                </div>

                <label className="mc-field mc-field--full">
                  <span className="mc-field__label">
                    Health Notes, Allergies or Diet Preference (optional)
                  </span>
                  <input
                    type="text"
                    className="f-input"
                    placeholder="e.g., Lactose intolerant, high protein, diabetic friendly..."
                    value={profileForm.health_notes}
                    onChange={(e) => setProfileForm((p) => ({ ...p, health_notes: e.target.value }))}
                  />
                </label>
              </div>

              <div className="mc-profile__actions">
                <button type="submit" className="f-cta" disabled={savingProfile}>
                  <span>{savingProfile ? 'Saving...' : 'Save & Continue'}</span>
                  <span className="f-cta__icon" aria-hidden="true">
                    <ArrowRight size={14} strokeWidth={1.75} />
                  </span>
                </button>
              </div>
            </form>
          </section>
        )}

        {/* 3. ADD MEAL / FOODY AI / MANUAL STAGE (Normal Compact Photo Size) */}
        <section className={`f-panel mc-workspace ${loadingPage || entryMode === 'analyzing' ? 'skeleton-panel' : ''}`}>
          {!loadingPage && entryMode !== 'analyzing' && (
            <div className="mc-workspace__row">
              {/* Compact Normal-Sized Meal Photo Column (236 x 176 px on desktop) */}
              <div className="mc-photo-col">
                <div className="mc-photo-box">
                  {photoData ? (
                    <>
                      <img src={photoData} alt={mealName || 'Captured meal'} className="mc-photo-box__img" />
                      <button
                        type="button"
                        className="mc-photo-clear"
                        aria-label="Remove meal photo"
                        onClick={() => setPhotoData('')}
                      >
                        <X size={13} />
                      </button>
                    </>
                  ) : (
                    <div className="mc-photo-empty">
                      <Camera size={22} strokeWidth={1.3} aria-hidden="true" />
                      <span>Meal photo</span>
                    </div>
                  )}
                </div>

                <div className="mc-photo-actions">
                  <button
                    type="button"
                    className="f-btn-secondary mc-photo-btn"
                    onClick={() => cameraInputRef.current?.click()}
                  >
                    <Camera size={13} strokeWidth={1.6} aria-hidden="true" />
                    <span>Camera</span>
                  </button>
                  <button
                    type="button"
                    className="f-btn-secondary mc-photo-btn"
                    onClick={() => uploadInputRef.current?.click()}
                  >
                    <Upload size={13} strokeWidth={1.6} aria-hidden="true" />
                    <span>Upload</span>
                  </button>
                </div>
              </div>

              {/* Right Column: Capture Mode */}
              {entryMode === 'capture' && (
                <div className="mc-form-col">
                  <h2 className="mc-section-title">Add Meal</h2>

                  <div className="mc-capture-fields">
                    <label className="mc-field mc-capture-fields__name">
                      <span className="mc-field__label">Meal Name</span>
                      <input
                        type="text"
                        className="f-input"
                        placeholder="e.g., Grilled Chicken & Rice"
                        value={mealName}
                        onChange={(e) => setMealName(e.target.value)}
                      />
                    </label>

                    <div className="mc-field mc-capture-fields__time">
                      <span className="mc-field__label">Meal Time</span>
                      <div className="mc-meal-tabs" role="radiogroup" aria-label="Meal Time">
                        {MEAL_TYPES.map((mt) => (
                          <button
                            key={mt.value}
                            type="button"
                            role="radio"
                            aria-checked={mealType === mt.value}
                            className={`mc-meal-tab ${mealType === mt.value ? 'is-active' : ''}`}
                            onClick={() => setMealType(mt.value)}
                          >
                            {mt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mc-btn-row">
                    <button type="button" className="f-cta" onClick={handleSendToFoodyClick}>
                      <span>Send to Foody</span>
                      <span className="f-cta__icon" aria-hidden="true">
                        <ArrowRight size={14} strokeWidth={1.75} />
                      </span>
                    </button>

                    <button type="button" className="f-btn-secondary" onClick={handleSwitchToManual}>
                      Manually
                    </button>
                  </div>
                </div>
              )}

              {/* Right Column: Foody AI Analysis Result */}
              {entryMode === 'ai_result' && aiResult && (
                <div className="mc-form-col">
                  <div className="mc-result-head">
                    <h2 className="mc-section-title">{mealName || aiResult.meal_name}</h2>
                    <span className="mc-result-time">{formatMealType(mealType)}</span>
                  </div>

                  <div className="mc-result-stats">
                    <div className="mc-stat-cell">
                      <span className="mc-stat-cell__label">Calories</span>
                      <span className="mc-stat-cell__val tabular">{aiResult.calories}</span>
                    </div>
                    <div className="mc-stat-cell">
                      <span className="mc-stat-cell__label">Protein</span>
                      <span className="mc-stat-cell__val tabular">{aiResult.protein_g} g</span>
                    </div>
                    <div className="mc-stat-cell">
                      <span className="mc-stat-cell__label">Carbs</span>
                      <span className="mc-stat-cell__val tabular">{aiResult.carbs_g} g</span>
                    </div>
                    <div className="mc-stat-cell">
                      <span className="mc-stat-cell__label">Fat</span>
                      <span className="mc-stat-cell__val tabular">{aiResult.fat_g} g</span>
                    </div>
                  </div>

                  {aiResult.health_note && (
                    <p className="mc-health-note">{aiResult.health_note}</p>
                  )}

                  <div className="mc-btn-row">
                    <button
                      type="button"
                      className="f-cta"
                      disabled={savingMeal}
                      onClick={() =>
                        saveMealToLibrary({
                          name: mealName || aiResult.meal_name,
                          calories: aiResult.calories,
                          protein_g: aiResult.protein_g,
                          carbs_g: aiResult.carbs_g,
                          fat_g: aiResult.fat_g,
                          notes: aiResult.health_note || '',
                        })
                      }
                    >
                      <span>{savingMeal ? 'Saving...' : 'Save to Library'}</span>
                      <span className="f-cta__icon" aria-hidden="true">
                        <ArrowRight size={14} strokeWidth={1.75} />
                      </span>
                    </button>

                    <button type="button" className="f-btn-secondary" onClick={handleSwitchToManual}>
                      Edit manually
                    </button>

                    <button
                      type="button"
                      className="mc-text-link"
                      onClick={() => {
                        setAiResult(null);
                        setEntryMode('capture');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Right Column: Manual Nutrition Entry */}
              {entryMode === 'manual' && (
                <form
                  className="mc-form-col"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveMealToLibrary({
                      name: mealName,
                      calories: manualForm.calories,
                      protein_g: manualForm.protein_g,
                      carbs_g: manualForm.carbs_g,
                      fat_g: manualForm.fat_g,
                    });
                  }}
                >
                  <div className="mc-result-head">
                    <h2 className="mc-section-title">Enter Nutrition Manually</h2>
                    <button
                      type="button"
                      className="mc-text-link"
                      onClick={() => setEntryMode('capture')}
                    >
                      Back
                    </button>
                  </div>

                  <div className="mc-capture-fields">
                    <label className="mc-field mc-capture-fields__name">
                      <span className="mc-field__label">Meal Name</span>
                      <input
                        type="text"
                        required
                        className="f-input"
                        placeholder="e.g., Grilled Chicken & Rice"
                        value={mealName}
                        onChange={(e) => setMealName(e.target.value)}
                      />
                    </label>

                    <div className="mc-field mc-capture-fields__time">
                      <span className="mc-field__label">Meal Time</span>
                      <div className="mc-meal-tabs" role="radiogroup" aria-label="Meal Time">
                        {MEAL_TYPES.map((mt) => (
                          <button
                            key={mt.value}
                            type="button"
                            role="radio"
                            aria-checked={mealType === mt.value}
                            className={`mc-meal-tab ${mealType === mt.value ? 'is-active' : ''}`}
                            onClick={() => setMealType(mt.value)}
                          >
                            {mt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mc-manual-stats">
                    <label className="mc-field">
                      <span className="mc-field__label">Calories</span>
                      <input
                        type="number"
                        min="0"
                        required
                        placeholder="0"
                        className="f-input tabular"
                        value={manualForm.calories}
                        onChange={(e) => setManualForm((m) => ({ ...m, calories: e.target.value }))}
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
                        value={manualForm.protein_g}
                        onChange={(e) => setManualForm((m) => ({ ...m, protein_g: e.target.value }))}
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
                        value={manualForm.carbs_g}
                        onChange={(e) => setManualForm((m) => ({ ...m, carbs_g: e.target.value }))}
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
                        value={manualForm.fat_g}
                        onChange={(e) => setManualForm((m) => ({ ...m, fat_g: e.target.value }))}
                      />
                    </label>
                  </div>

                  <div className="mc-btn-row">
                    <button type="submit" className="f-cta" disabled={savingMeal}>
                      <span>{savingMeal ? 'Saving...' : 'Save Meal'}</span>
                      <span className="f-cta__icon" aria-hidden="true">
                        <ArrowRight size={14} strokeWidth={1.75} />
                      </span>
                    </button>

                    <button
                      type="button"
                      className="f-btn-secondary"
                      onClick={handleSendToFoodyClick}
                    >
                      Send to Foody instead
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </section>

        {/* 4. TODAY'S MEALS VISUAL LIBRARY */}
        <section className="mc-library">
          <div className="mc-library__head">
            <h2 className="mc-section-title">Today&apos;s Meals</h2>
          </div>

          {loadingPage ? (
            <div className="mc-library__grid" aria-busy="true" aria-label="Loading meals">
              <article className="meal-card" />
              <article className="meal-card" />
              <article className="meal-card" />
            </div>
          ) : mealItems.length === 0 ? (
            <div className="mc-library__empty">
              <p>No meals logged for this day yet. Take a photo or add one manually above.</p>
            </div>
          ) : (
            <div className="mc-library__grid">
              {mealItems.map((item) => (
                <article key={item.id} className="meal-card">
                  <div className="meal-card__media">
                    {item.image_data ? (
                      <img src={item.image_data} alt={item.food_name} className="meal-card__img" />
                    ) : (
                      <div className="meal-card__blank">
                        <span>Meal photo</span>
                      </div>
                    )}
                    <button
                      type="button"
                      className="meal-card__delete"
                      aria-label={`Delete ${item.food_name}`}
                      onClick={() => handleDeleteMeal(item.id)}
                    >
                      <Trash2 size={13} strokeWidth={1.6} />
                    </button>
                  </div>

                  <div className="meal-card__body">
                    <span className="meal-card__time">{formatMealType(item.meal_type)}</span>
                    <h3 className="meal-card__name">{item.food_name}</h3>
                  </div>

                  <div className="meal-card__stats">
                    <div className="meal-card__stat">
                      <span className="meal-card__stat-label">Calories</span>
                      <span className="meal-card__stat-val tabular">{Math.round(item.calories)}</span>
                    </div>
                    <div className="meal-card__stat">
                      <span className="meal-card__stat-label">Protein</span>
                      <span className="meal-card__stat-val tabular">{Math.round(item.protein_g)} g</span>
                    </div>
                    <div className="meal-card__stat">
                      <span className="meal-card__stat-label">Carbs</span>
                      <span className="meal-card__stat-val tabular">{Math.round(item.carbs_g)} g</span>
                    </div>
                    <div className="meal-card__stat">
                      <span className="meal-card__stat-label">Fat</span>
                      <span className="meal-card__stat-val tabular">{Math.round(item.fat_g)} g</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
