const express = require('express');
const router = express.Router();
const { queryAll, queryOne, execute } = require('../db');
const { getTodayDateString, getDayOfWeekName } = require('../utils/calculations');
const { getProfileWithMetrics } = require('./profile');
const { buildDailyNutritionSummary } = require('./foods');
const { getWeeklyMealPlan } = require('./mealPlans');
const { getWorkoutPlanWithExercises, enrichWorkoutLog } = require('./workouts');

function getDailyHydrationSummary(dateStr) {
  const profile = queryOne('SELECT daily_water_ml FROM user_profile WHERE id = 1');
  const entries = queryAll(
    'SELECT * FROM water_logs WHERE date = ? ORDER BY id ASC',
    [dateStr]
  );
  const consumed_ml = entries.reduce((acc, r) => acc + Number(r.amount_ml || 0), 0);
  const target_ml = profile?.daily_water_ml || 3000;
  const remaining_ml = Math.max(0, target_ml - consumed_ml);
  const percentage = target_ml > 0 ? Math.round((consumed_ml / target_ml) * 100) : 0;

  return {
    date: dateStr,
    consumed_ml,
    target_ml,
    remaining_ml,
    percentage,
    entries,
  };
}

function getWeightSummary(days = 30) {
  const profile = queryOne('SELECT weight_kg, target_weight_kg FROM user_profile WHERE id = 1');
  const rows = queryAll(
    'SELECT * FROM weight_logs ORDER BY date DESC LIMIT ?',
    [Number(days)]
  ).reverse();

  // Compute 7-day rolling average
  const enriched = rows.map((row, idx) => {
    const windowSlice = rows.slice(Math.max(0, idx - 6), idx + 1);
    const avg =
      windowSlice.reduce((sum, item) => sum + Number(item.weight_kg), 0) / windowSlice.length;
    return {
      ...row,
      rolling_avg_kg: Number(avg.toFixed(2)),
    };
  });

  const latest = enriched[enriched.length - 1] || null;
  const earliest = enriched[0] || null;
  const current_kg = latest ? Number(latest.weight_kg) : Number(profile?.weight_kg || 78.5);
  const start_kg = earliest ? Number(earliest.weight_kg) : current_kg;
  const target_kg = Number(profile?.target_weight_kg || 75.0);
  const change_kg = Number((current_kg - start_kg).toFixed(1));
  const to_goal_kg = Number(Math.abs(current_kg - target_kg).toFixed(1));

  const weights = enriched.map((r) => Number(r.weight_kg));
  return {
    current_kg,
    start_kg,
    target_kg,
    change_kg,
    to_goal_kg,
    min_kg: weights.length ? Math.min(...weights) : current_kg,
    max_kg: weights.length ? Math.max(...weights) : current_kg,
    latest_log: latest,
    entries: enriched,
  };
}

// GET /api/water-logs?date=YYYY-MM-DD
router.get('/water-logs', (req, res) => {
  const dateStr = req.query.date || getTodayDateString();
  res.json(getDailyHydrationSummary(dateStr));
});

// POST /api/water-logs
router.post('/water-logs', (req, res) => {
  const dateStr = req.body.date || getTodayDateString();
  const amount_ml = Number(req.body.amount_ml ?? 250);
  if (!amount_ml || amount_ml <= 0) {
    return res.status(400).json({ error: 'amount_ml must be a positive integer' });
  }

  const result = execute(
    'INSERT INTO water_logs (date, amount_ml, note) VALUES (?, ?, ?)',
    [dateStr, Math.round(amount_ml), req.body.note || '']
  );

  const entry = queryOne('SELECT * FROM water_logs WHERE id = ?', [Number(result.lastInsertRowid)]);
  res.status(201).json({
    entry,
    hydration: getDailyHydrationSummary(dateStr),
  });
});

// DELETE /api/water-logs/:id
router.delete('/water-logs/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = queryOne('SELECT * FROM water_logs WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Water log not found' });

  execute('DELETE FROM water_logs WHERE id = ?', [id]);
  res.json({
    deleted: true,
    id,
    hydration: getDailyHydrationSummary(existing.date),
  });
});

// GET /api/weight-logs?days=30
router.get('/weight-logs', (req, res) => {
  const days = Number(req.query.days ?? 30);
  res.json(getWeightSummary(days));
});

// POST /api/weight-logs
router.post('/weight-logs', (req, res) => {
  const dateStr = req.body.date || getTodayDateString();
  const weight_kg = Number(req.body.weight_kg);
  if (!weight_kg || weight_kg <= 0) {
    return res.status(400).json({ error: 'Valid weight_kg is required' });
  }
  const body_fat_pct =
    req.body.body_fat_pct !== undefined && req.body.body_fat_pct !== null && req.body.body_fat_pct !== ''
      ? Number(req.body.body_fat_pct)
      : null;

  execute(
    `INSERT INTO weight_logs (date, weight_kg, body_fat_pct, notes)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       weight_kg = excluded.weight_kg,
       body_fat_pct = COALESCE(excluded.body_fat_pct, weight_logs.body_fat_pct),
       notes = excluded.notes`,
    [dateStr, weight_kg, body_fat_pct, req.body.notes || '']
  );

  // Sync user_profile.weight_kg if this log is the latest recorded date
  const latestRow = queryOne('SELECT date, weight_kg FROM weight_logs ORDER BY date DESC LIMIT 1');
  if (latestRow && latestRow.date === dateStr) {
    execute("UPDATE user_profile SET weight_kg = ?, updated_at = datetime('now') WHERE id = 1", [
      weight_kg,
    ]);
  }

  res.status(201).json(getWeightSummary(30));
});

// DELETE /api/weight-logs/:id
router.delete('/weight-logs/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = queryOne('SELECT * FROM weight_logs WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Weight log not found' });

  execute('DELETE FROM weight_logs WHERE id = ?', [id]);
  res.json({
    deleted: true,
    id,
    weight_summary: getWeightSummary(30),
  });
});

// GET /api/dashboard?date=YYYY-MM-DD
router.get('/dashboard', (req, res) => {
  const dateStr = req.query.date || getTodayDateString();
  const day_of_week = getDayOfWeekName(dateStr);

  const profile = getProfileWithMetrics();
  const nutrition = buildDailyNutritionSummary(dateStr);
  const hydration = getDailyHydrationSummary(dateStr);

  const mealPlanForDay = getWeeklyMealPlan(day_of_week).days[day_of_week] || {
    day_of_week,
    items: [],
    meals: { breakfast: [], lunch: [], dinner: [], snack: [] },
    totals: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  };

  const planRow = queryOne('SELECT id FROM workout_plans WHERE day_of_week = ?', [day_of_week]);
  const today_workout_plan = planRow ? getWorkoutPlanWithExercises(planRow.id) : null;

  const todayWorkoutRows = queryAll('SELECT * FROM workout_logs WHERE date = ? ORDER BY id DESC', [
    dateStr,
  ]);
  const today_workout_logs = todayWorkoutRows.map(enrichWorkoutLog);

  const weightSummary = getWeightSummary(14);

  res.json({
    date: dateStr,
    day_of_week,
    profile,
    nutrition,
    hydration,
    today_meal_plan: mealPlanForDay,
    today_workout_plan,
    today_workout_logs,
    weight: weightSummary,
  });
});

// GET /api/analytics?days=14
router.get('/analytics', (req, res) => {
  const days = Math.max(1, Math.min(90, Number(req.query.days ?? 14)));
  const profile = getProfileWithMetrics();

  // Generate date range strings ending today
  const now = new Date();
  const dateList = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    dateList.push(`${yyyy}-${mm}-${dd}`);
  }

  const startDate = dateList[0];
  const endDate = dateList[dateList.length - 1];

  // 1. Daily Nutrition Series
  const foodRows = queryAll(
    `SELECT date,
            SUM(calories) AS calories,
            ROUND(SUM(protein_g), 1) AS protein_g,
            ROUND(SUM(carbs_g), 1) AS carbs_g,
            ROUND(SUM(fat_g), 1) AS fat_g,
            ROUND(SUM(fiber_g), 1) AS fiber_g,
            COUNT(*) AS entries_count
     FROM food_logs
     WHERE date >= ? AND date <= ?
     GROUP BY date`,
    [startDate, endDate]
  );
  const foodByDate = Object.fromEntries(foodRows.map((r) => [r.date, r]));

  const nutrition_series = dateList.map((d) => {
    const row = foodByDate[d];
    return {
      date: d,
      calories: row ? Number(row.calories) : 0,
      protein_g: row ? Number(row.protein_g) : 0,
      carbs_g: row ? Number(row.carbs_g) : 0,
      fat_g: row ? Number(row.fat_g) : 0,
      fiber_g: row ? Number(row.fiber_g) : 0,
      target_calories: profile.daily_calorie_target,
      target_protein_g: profile.daily_protein_g,
      entries_count: row ? Number(row.entries_count) : 0,
    };
  });

  // 2. Daily Hydration Series
  const waterRows = queryAll(
    `SELECT date, SUM(amount_ml) AS amount_ml
     FROM water_logs
     WHERE date >= ? AND date <= ?
     GROUP BY date`,
    [startDate, endDate]
  );
  const waterByDate = Object.fromEntries(waterRows.map((r) => [r.date, Number(r.amount_ml)]));
  const hydration_series = dateList.map((d) => ({
    date: d,
    amount_ml: waterByDate[d] || 0,
    target_ml: profile.daily_water_ml,
  }));

  // 3. Weight Series
  const weightSummary = getWeightSummary(days);

  // 4. Workout Summary & Muscle Group Breakdown
  const workoutRows = queryAll(
    'SELECT * FROM workout_logs WHERE date >= ? AND date <= ? ORDER BY date ASC',
    [startDate, endDate]
  ).map(enrichWorkoutLog);

  const muscleGroupSets = {};
  let total_volume_kg = 0;
  let total_sets = 0;
  let total_duration_min = 0;
  let total_calories_burned = 0;
  let total_prs = 0;

  for (const w of workoutRows) {
    total_volume_kg += w.total_volume_kg;
    total_sets += w.working_sets;
    total_duration_min += Number(w.duration_min || 0);
    total_calories_burned += Number(w.calories_burned || 0);
    total_prs += w.pr_count;
    for (const s of w.sets) {
      if (!s.is_warmup) {
        const mg = s.muscle_group || 'Other';
        muscleGroupSets[mg] = (muscleGroupSets[mg] || 0) + 1;
      }
    }
  }

  const loggedNutritionDays = nutrition_series.filter((d) => d.calories > 0);
  const avg_daily_calories = loggedNutritionDays.length
    ? Math.round(
        loggedNutritionDays.reduce((acc, d) => acc + d.calories, 0) / loggedNutritionDays.length
      )
    : 0;
  const avg_daily_protein_g = loggedNutritionDays.length
    ? Math.round(
        loggedNutritionDays.reduce((acc, d) => acc + d.protein_g, 0) / loggedNutritionDays.length
      )
    : 0;

  res.json({
    period_days: days,
    start_date: startDate,
    end_date: endDate,
    averages: {
      daily_calories: avg_daily_calories,
      daily_protein_g: avg_daily_protein_g,
      target_calories: profile.daily_calorie_target,
      target_protein_g: profile.daily_protein_g,
    },
    nutrition_series,
    hydration_series,
    weight_series: weightSummary.entries,
    weight_summary: {
      current_kg: weightSummary.current_kg,
      start_kg: weightSummary.start_kg,
      target_kg: weightSummary.target_kg,
      change_kg: weightSummary.change_kg,
      to_goal_kg: weightSummary.to_goal_kg,
    },
    workout_summary: {
      total_sessions: workoutRows.length,
      total_working_sets: total_sets,
      total_volume_kg,
      total_duration_min,
      total_calories_burned,
      total_prs,
      muscle_group_distribution: Object.entries(muscleGroupSets).map(([muscle_group, sets]) => ({
        muscle_group,
        sets,
      })),
      sessions: workoutRows,
    },
  });
});

module.exports = {
  router,
};
