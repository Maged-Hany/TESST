/**
 * Deterministic Nutrition & Strength Calculations (Node.js mirror of execution/calculate_targets.py)
 */

const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const ACTIVITY_WATER_BONUS_ML = {
  sedentary: 0,
  light: 250,
  moderate: 500,
  active: 750,
  very_active: 1000,
};

const GOAL_CALORIE_OFFSET = {
  cut: -450,
  maintain: 0,
  bulk: 300,
};

const DIET_MACRO_SPLITS = {
  balanced: { protein: 0.30, carbs: 0.40, fat: 0.30 },
  high_protein: { protein: 0.35, carbs: 0.40, fat: 0.25 },
  low_carb: { protein: 0.35, carbs: 0.25, fat: 0.40 },
  keto: { protein: 0.30, carbs: 0.05, fat: 0.65 },
};

function calculateNutritionTargets({
  weight_kg = 78.5,
  height_cm = 178,
  age = 27,
  gender = 'male',
  activity_level = 'moderate',
  goal = 'cut',
  diet_preference = 'high_protein',
} = {}) {
  const genderNorm = String(gender || 'male').toLowerCase().trim();
  const activityNorm = ACTIVITY_MULTIPLIERS[activity_level] ? activity_level : 'moderate';
  const goalNorm = GOAL_CALORIE_OFFSET[goal] !== undefined ? goal : 'maintain';
  const dietNorm = DIET_MACRO_SPLITS[diet_preference] ? diet_preference : 'balanced';

  const baseBmr = 10 * Number(weight_kg) + 6.25 * Number(height_cm) - 5 * Number(age);
  const bmr = Math.round(genderNorm === 'female' ? baseBmr - 161 : baseBmr + 5);

  const multiplier = ACTIVITY_MULTIPLIERS[activityNorm];
  const tdee = Math.round(bmr * multiplier);

  const offset = GOAL_CALORIE_OFFSET[goalNorm];
  const daily_calorie_target = Math.max(1200, tdee + offset);

  const splits = DIET_MACRO_SPLITS[dietNorm];
  const daily_protein_g = Math.round((daily_calorie_target * splits.protein) / 4);
  const daily_carbs_g = Math.round((daily_calorie_target * splits.carbs) / 4);
  const daily_fat_g = Math.round((daily_calorie_target * splits.fat) / 9);
  const daily_fiber_g = Math.max(25, Math.min(45, Math.round((daily_calorie_target / 1000) * 14)));

  const rawWater = Number(weight_kg) * 35 + ACTIVITY_WATER_BONUS_ML[activityNorm];
  const daily_water_ml = Math.round(rawWater / 50) * 50;

  return {
    bmr,
    tdee,
    activity_multiplier: multiplier,
    goal_calorie_offset: offset,
    daily_calorie_target,
    daily_protein_g,
    daily_carbs_g,
    daily_fat_g,
    daily_fiber_g,
    daily_water_ml,
    macro_split_pct: {
      protein: Math.round(splits.protein * 100),
      carbs: Math.round(splits.carbs * 100),
      fat: Math.round(splits.fat * 100),
    },
  };
}

function calculate1RM(weight_kg, reps) {
  const w = Number(weight_kg) || 0;
  const r = Number(reps) || 0;
  if (w <= 0 || r <= 0) {
    return { weight_kg: w, reps: r, estimated_1rm: 0, percentages: {} };
  }
  const estimated_1rm = r === 1 ? Number(w.toFixed(1)) : Number((w * (1 + r / 30)).toFixed(1));
  const percentages = {};
  for (const pct of [95, 90, 85, 80, 75, 70, 65, 60]) {
    percentages[`${pct}%`] = Number((estimated_1rm * (pct / 100)).toFixed(1));
  }
  return {
    weight_kg: w,
    reps: r,
    estimated_1rm,
    percentages,
  };
}

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDayOfWeekName(dateStr) {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) {
    return days[new Date().getDay()];
  }
  const dt = new Date(y, m - 1, d);
  return days[dt.getDay()];
}

module.exports = {
  ACTIVITY_MULTIPLIERS,
  GOAL_CALORIE_OFFSET,
  DIET_MACRO_SPLITS,
  calculateNutritionTargets,
  calculate1RM,
  getTodayDateString,
  getDayOfWeekName,
};
