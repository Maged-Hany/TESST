const express = require('express');
const router = express.Router();
const { queryOne, execute } = require('../db');
const { calculateNutritionTargets, calculate1RM } = require('../utils/calculations');

function getProfileWithMetrics() {
  const profile = queryOne('SELECT * FROM user_profile WHERE id = 1');
  if (!profile) return null;
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
  const profile = getProfileWithMetrics();
  res.json(profile);
});

// PUT /api/profile
router.put('/profile', (req, res) => {
  const current = queryOne('SELECT * FROM user_profile WHERE id = 1');
  if (!current) {
    return res.status(404).json({ error: 'User profile not found' });
  }

  const merged = {
    name: req.body.name ?? current.name,
    age: Number(req.body.age ?? current.age),
    gender: req.body.gender ?? current.gender,
    height_cm: Number(req.body.height_cm ?? current.height_cm),
    weight_kg: Number(req.body.weight_kg ?? current.weight_kg),
    target_weight_kg: Number(req.body.target_weight_kg ?? current.target_weight_kg),
    activity_level: req.body.activity_level ?? current.activity_level,
    goal: req.body.goal ?? current.goal,
    diet_preference: req.body.diet_preference ?? current.diet_preference,
    health_notes: req.body.health_notes !== undefined ? String(req.body.health_notes) : (current.health_notes || ''),
    profile_completed:
      req.body.profile_completed !== undefined
        ? req.body.profile_completed
          ? 1
          : 0
        : current.profile_completed ?? 0,
  };

  const recalculate = req.body.recalculate_targets !== false;
  const autoTargets = calculateNutritionTargets(merged);

  const daily_calorie_target =
    !recalculate && req.body.daily_calorie_target !== undefined
      ? Number(req.body.daily_calorie_target)
      : req.body.daily_calorie_target !== undefined && req.body.recalculate_targets === false
      ? Number(req.body.daily_calorie_target)
      : req.body.recalculate_targets === true
      ? autoTargets.daily_calorie_target
      : req.body.daily_calorie_target !== undefined
      ? Number(req.body.daily_calorie_target)
      : autoTargets.daily_calorie_target;

  const daily_protein_g =
    req.body.recalculate_targets === true
      ? autoTargets.daily_protein_g
      : Number(req.body.daily_protein_g ?? autoTargets.daily_protein_g);

  const daily_carbs_g =
    req.body.recalculate_targets === true
      ? autoTargets.daily_carbs_g
      : Number(req.body.daily_carbs_g ?? autoTargets.daily_carbs_g);

  const daily_fat_g =
    req.body.recalculate_targets === true
      ? autoTargets.daily_fat_g
      : Number(req.body.daily_fat_g ?? autoTargets.daily_fat_g);

  const daily_fiber_g =
    req.body.recalculate_targets === true
      ? autoTargets.daily_fiber_g
      : Number(req.body.daily_fiber_g ?? autoTargets.daily_fiber_g);

  const daily_water_ml =
    req.body.recalculate_targets === true
      ? autoTargets.daily_water_ml
      : Number(req.body.daily_water_ml ?? autoTargets.daily_water_ml);

  execute(
    `UPDATE user_profile
     SET name = ?, age = ?, gender = ?, height_cm = ?, weight_kg = ?, target_weight_kg = ?,
         activity_level = ?, goal = ?, diet_preference = ?,
         daily_calorie_target = ?, daily_protein_g = ?, daily_carbs_g = ?, daily_fat_g = ?,
         daily_fiber_g = ?, daily_water_ml = ?, health_notes = ?, profile_completed = ?,
         updated_at = datetime('now')
     WHERE id = 1`,
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
    ]
  );

  res.json(getProfileWithMetrics());
});

// POST /api/calculator/tdee
router.post('/calculator/tdee', (req, res) => {
  const current = queryOne('SELECT * FROM user_profile WHERE id = 1') || {};
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
    execute(
      `UPDATE user_profile
       SET weight_kg = ?, height_cm = ?, age = ?, gender = ?,
           activity_level = ?, goal = ?, diet_preference = ?,
           daily_calorie_target = ?, daily_protein_g = ?, daily_carbs_g = ?,
           daily_fat_g = ?, daily_fiber_g = ?, daily_water_ml = ?,
           updated_at = datetime('now')
       WHERE id = 1`,
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
