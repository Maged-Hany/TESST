const express = require('express');
const router = express.Router();
const { execute } = require('../db');
const {
  ACTIVITY_MULTIPLIERS,
  GOAL_CALORIE_OFFSET,
  DIET_MACRO_SPLITS,
  calculateNutritionTargets,
  calculate1RM,
} = require('../utils/calculations');
const { readEnum, readNumber, readText } = require('../utils/validate');
const { getProfileRow, sanitizeUser } = require('../middleware/auth');

function getProfileWithMetrics(userId = 0) {
  const raw = getProfileRow(userId);
  if (!raw) return null;
  const profile = sanitizeUser(raw);
  const computed = calculateNutritionTargets(profile);
  return {
    ...profile,
    bmr: computed.bmr,
    tdee: computed.tdee,
    activity_multiplier: computed.activity_multiplier,
    goal_calorie_offset: computed.goal_calorie_offset,
    macro_split_pct: computed.macro_split_pct,
  };
}

// GET /api/profile
router.get('/profile', (req, res) => {
  res.json(getProfileWithMetrics(req.userId));
});

// PUT /api/profile
router.put('/profile', (req, res) => {
  const current = getProfileRow(req.userId);
  if (!current) {
    return res.status(404).json({ error: 'User profile not found' });
  }

  const body = req.body || {};
  const merged = {
    name: readText(body.name, current.name, 60) || current.name,
    age: readNumber(body.age, { label: 'Age', min: 13, max: 100, integer: true, fallback: current.age }),
    gender: readEnum(body.gender, ['male', 'female'], current.gender, 'gender'),
    height_cm: readNumber(body.height_cm, { label: 'Height', min: 100, max: 250, fallback: current.height_cm }),
    weight_kg: readNumber(body.weight_kg, { label: 'Weight', min: 25, max: 300, fallback: current.weight_kg }),
    target_weight_kg: readNumber(body.target_weight_kg, {
      label: 'Target weight',
      min: 25,
      max: 300,
      fallback: current.target_weight_kg,
    }),
    activity_level: readEnum(
      body.activity_level,
      Object.keys(ACTIVITY_MULTIPLIERS),
      current.activity_level,
      'activity_level'
    ),
    goal: readEnum(body.goal, Object.keys(GOAL_CALORIE_OFFSET), current.goal, 'goal'),
    diet_preference: readEnum(
      body.diet_preference,
      Object.keys(DIET_MACRO_SPLITS),
      current.diet_preference,
      'diet_preference'
    ),
    health_notes: readText(body.health_notes, current.health_notes || '', 300),
    profile_completed:
      body.profile_completed !== undefined ? (body.profile_completed ? 1 : 0) : current.profile_completed ?? 0,
  };

  const auto = calculateNutritionTargets(merged);
  const recalc = body.recalculate_targets === true;
  const pickTarget = (field, label, max) =>
    recalc
      ? auto[field]
      : readNumber(body[field], { label, min: 1, max, integer: true, fallback: auto[field] });

  const daily_calorie_target = pickTarget('daily_calorie_target', 'Calorie target', 10000);
  const daily_protein_g = pickTarget('daily_protein_g', 'Protein target', 1000);
  const daily_carbs_g = pickTarget('daily_carbs_g', 'Carbs target', 2000);
  const daily_fat_g = pickTarget('daily_fat_g', 'Fat target', 1000);
  const daily_fiber_g = pickTarget('daily_fiber_g', 'Fiber target', 300);
  const daily_water_ml = pickTarget('daily_water_ml', 'Water target', 20000);

  const table = req.userId > 0 ? 'users' : 'user_profile';
  const targetId = req.userId > 0 ? req.userId : 1;

  execute(
    `UPDATE ${table}
     SET name = ?, age = ?, gender = ?, height_cm = ?, weight_kg = ?, target_weight_kg = ?,
         activity_level = ?, goal = ?, diet_preference = ?,
         daily_calorie_target = ?, daily_protein_g = ?, daily_carbs_g = ?, daily_fat_g = ?,
         daily_fiber_g = ?, daily_water_ml = ?, health_notes = ?, profile_completed = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
    [
      merged.name,
      merged.age,
      merged.gender,
      merged.height_cm,
      merged.weight_kg,
      merged.target_weight_kg,
      merged.activity_level,
      merged.goal,
      merged.diet_preference,
      daily_calorie_target,
      daily_protein_g,
      daily_carbs_g,
      daily_fat_g,
      daily_fiber_g,
      daily_water_ml,
      merged.health_notes,
      merged.profile_completed,
      targetId,
    ]
  );

  res.json(getProfileWithMetrics(req.userId));
});

// POST /api/calculator/tdee
router.post('/calculator/tdee', (req, res) => {
  const current = getProfileRow(req.userId) || {};
  const input = {
    weight_kg: Number(req.body.weight_kg ?? current.weight_kg ?? 78.5),
    height_cm: Number(req.body.height_cm ?? current.height_cm ?? 178),
    age: Number(req.body.age ?? current.age ?? 27),
    gender: req.body.gender ?? current.gender ?? 'male',
    activity_level: req.body.activity_level ?? current.activity_level ?? 'moderate',
    goal: req.body.goal ?? current.goal ?? 'cut',
    diet_preference: req.body.diet_preference ?? current.diet_preference ?? 'high_protein',
  };

  const result = calculateNutritionTargets(input);

  if (req.body.apply_to_profile) {
    const table = req.userId > 0 ? 'users' : 'user_profile';
    const targetId = req.userId > 0 ? req.userId : 1;
    execute(
      `UPDATE ${table}
       SET weight_kg = ?, height_cm = ?, age = ?, gender = ?,
           activity_level = ?, goal = ?, diet_preference = ?,
           daily_calorie_target = ?, daily_protein_g = ?, daily_carbs_g = ?,
           daily_fat_g = ?, daily_fiber_g = ?, daily_water_ml = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
      [
        input.weight_kg,
        input.height_cm,
        input.age,
        input.gender,
        input.activity_level,
        input.goal,
        input.diet_preference,
        result.daily_calorie_target,
        result.daily_protein_g,
        result.daily_carbs_g,
        result.daily_fat_g,
        result.daily_fiber_g,
        result.daily_water_ml,
        targetId,
      ]
    );
  }

  res.json({
    input,
    ...result,
    applied_to_profile: Boolean(req.body.apply_to_profile),
  });
});

// POST /api/calculator/1rm
router.post('/calculator/1rm', (req, res) => {
  const { weight_kg, reps } = req.body;
  res.json(calculate1RM(weight_kg, reps));
});

module.exports = {
  router,
  getProfileWithMetrics,
};
