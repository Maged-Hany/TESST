const express = require('express');
const router = express.Router();
const { queryAll, queryOne, execute, transaction } = require('../db');
const { getTodayDateString } = require('../utils/calculations');
const { getProfileRow } = require('../middleware/auth');

const DAYS_OF_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function getWeeklyMealPlan(filterDay = null, userId = 0) {
  const profile = getProfileRow(userId);
  const rows = filterDay
    ? queryAll(
        'SELECT * FROM meal_plans WHERE user_id = ? AND day_of_week = ? ORDER BY order_index ASC, id ASC',
        [userId, filterDay.toLowerCase()]
      )
    : queryAll(
        'SELECT * FROM meal_plans WHERE user_id = ? ORDER BY order_index ASC, id ASC',
        [userId]
      );

  const days = {};
  for (const d of DAYS_OF_WEEK) {
    if (filterDay && d !== filterDay.toLowerCase()) continue;
    days[d] = {
      day_of_week: d,
      items: [],
      meals: { breakfast: [], lunch: [], dinner: [], snack: [] },
      totals: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
      completed_count: 0,
      total_count: 0,
    };
  }

  for (const item of rows) {
    const dayObj = days[item.day_of_week];
    if (!dayObj) continue;
    dayObj.items.push(item);
    const mType = dayObj.meals[item.meal_type] ? item.meal_type : 'snack';
    dayObj.meals[mType].push(item);
    dayObj.totals.calories += Number(item.calories || 0);
    dayObj.totals.protein_g = Number((dayObj.totals.protein_g + Number(item.protein_g || 0)).toFixed(1));
    dayObj.totals.carbs_g = Number((dayObj.totals.carbs_g + Number(item.carbs_g || 0)).toFixed(1));
    dayObj.totals.fat_g = Number((dayObj.totals.fat_g + Number(item.fat_g || 0)).toFixed(1));
    dayObj.total_count += 1;
    if (item.is_completed) dayObj.completed_count += 1;
  }

  return {
    targets: {
      calories: profile?.daily_calorie_target || 2290,
      protein_g: profile?.daily_protein_g || 200,
      carbs_g: profile?.daily_carbs_g || 229,
      fat_g: profile?.daily_fat_g || 64,
    },
    days,
  };
}

// GET /api/meal-plans
router.get('/meal-plans', (req, res) => {
  const { day_of_week } = req.query;
  res.json(getWeeklyMealPlan(day_of_week || null, req.userId));
});

// POST /api/meal-plans
router.post('/meal-plans', (req, res) => {
  const day_of_week = String(req.body.day_of_week || 'monday').toLowerCase();
  if (!DAYS_OF_WEEK.includes(day_of_week)) {
    return res.status(400).json({ error: 'Invalid day_of_week' });
  }

  const meal_type = ['breakfast', 'lunch', 'dinner', 'snack'].includes(req.body.meal_type)
    ? req.body.meal_type
    : 'breakfast';
  const servings = Number(req.body.servings ?? 1);
  let food_id = req.body.food_id ? Number(req.body.food_id) : null;
  let meal_name = req.body.meal_name;
  let serving_unit = req.body.serving_unit || 'serving';
  let calories = Number(req.body.calories ?? 0);
  let protein_g = Number(req.body.protein_g ?? 0);
  let carbs_g = Number(req.body.carbs_g ?? 0);
  let fat_g = Number(req.body.fat_g ?? 0);

  if (food_id) {
    const food = queryOne('SELECT * FROM foods WHERE id = ?', [food_id]);
    if (food) {
      meal_name = meal_name || food.name;
      serving_unit = food.serving_unit;
      if (req.body.calories === undefined) {
        calories = Math.round(food.calories * servings);
        protein_g = Number((food.protein_g * servings).toFixed(1));
        carbs_g = Number((food.carbs_g * servings).toFixed(1));
        fat_g = Number((food.fat_g * servings).toFixed(1));
      }
    }
  }

  if (!meal_name || !String(meal_name).trim()) {
    return res.status(400).json({ error: 'meal_name or valid food_id is required' });
  }

  const result = execute(
    `INSERT INTO meal_plans (
      user_id, day_of_week, meal_type, food_id, meal_name, servings, serving_unit,
      calories, protein_g, carbs_g, fat_g, prep_notes, is_completed, order_index
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.userId,
      day_of_week,
      meal_type,
      food_id,
      String(meal_name).trim(),
      servings,
      serving_unit,
      Math.round(calories),
      protein_g,
      carbs_g,
      fat_g,
      req.body.prep_notes || '',
      req.body.is_completed ? 1 : 0,
      Number(req.body.order_index ?? 0),
    ]
  );

  const created = queryOne('SELECT * FROM meal_plans WHERE id = ?', [Number(result.lastInsertRowid)]);
  res.status(201).json(created);
});

// PUT /api/meal-plans/:id
router.put('/meal-plans/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = queryOne('SELECT * FROM meal_plans WHERE id = ? AND user_id = ?', [id, req.userId]);
  if (!existing) return res.status(404).json({ error: 'Meal plan item not found' });

  execute(
    `UPDATE meal_plans
     SET day_of_week = ?, meal_type = ?, meal_name = ?, servings = ?, serving_unit = ?,
         calories = ?, protein_g = ?, carbs_g = ?, fat_g = ?, prep_notes = ?, is_completed = ?
     WHERE id = ? AND user_id = ?`,
    [
      req.body.day_of_week ? String(req.body.day_of_week).toLowerCase() : existing.day_of_week,
      req.body.meal_type ?? existing.meal_type,
      req.body.meal_name ?? existing.meal_name,
      Number(req.body.servings ?? existing.servings),
      req.body.serving_unit ?? existing.serving_unit,
      Math.round(Number(req.body.calories ?? existing.calories)),
      Number(req.body.protein_g ?? existing.protein_g),
      Number(req.body.carbs_g ?? existing.carbs_g),
      Number(req.body.fat_g ?? existing.fat_g),
      req.body.prep_notes ?? existing.prep_notes,
      req.body.is_completed !== undefined ? (req.body.is_completed ? 1 : 0) : existing.is_completed,
      id,
      req.userId,
    ]
  );

  res.json(queryOne('SELECT * FROM meal_plans WHERE id = ?', [id]));
});

// POST /api/meal-plans/:id/log — Log a planned meal directly into daily food_logs
router.post('/meal-plans/:id/log', (req, res) => {
  const id = Number(req.params.id);
  const planItem = queryOne('SELECT * FROM meal_plans WHERE id = ? AND user_id = ?', [id, req.userId]);
  if (!planItem) return res.status(404).json({ error: 'Meal plan item not found' });

  const dateStr = req.body.date || getTodayDateString();
  let fiber_g = 0;
  let serving_size = 100;
  if (planItem.food_id) {
    const food = queryOne('SELECT * FROM foods WHERE id = ?', [planItem.food_id]);
    if (food) {
      fiber_g = Number((food.fiber_g * planItem.servings).toFixed(1));
      serving_size = food.serving_size;
    }
  }

  const logRes = execute(
    `INSERT INTO food_logs (
      user_id, date, meal_type, food_id, food_name, servings, serving_size, serving_unit,
      calories, protein_g, carbs_g, fat_g, fiber_g, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.userId,
      dateStr,
      planItem.meal_type,
      planItem.food_id,
      planItem.meal_name,
      planItem.servings,
      serving_size,
      planItem.serving_unit,
      planItem.calories,
      planItem.protein_g,
      planItem.carbs_g,
      planItem.fat_g,
      fiber_g,
      planItem.prep_notes || 'Logged from Weekly Meal Planner',
    ]
  );

  execute('UPDATE meal_plans SET is_completed = 1 WHERE id = ? AND user_id = ?', [id, req.userId]);

  res.status(201).json({
    logged_entry: queryOne('SELECT * FROM food_logs WHERE id = ?', [Number(logRes.lastInsertRowid)]),
    meal_plan_item: queryOne('SELECT * FROM meal_plans WHERE id = ?', [id]),
  });
});

// POST /api/meal-plans/day/:dayOfWeek/log-all
router.post('/meal-plans/day/:dayOfWeek/log-all', (req, res) => {
  const day = String(req.params.dayOfWeek || '').toLowerCase();
  if (!DAYS_OF_WEEK.includes(day)) {
    return res.status(400).json({ error: 'Invalid dayOfWeek' });
  }
  const dateStr = req.body.date || getTodayDateString();
  const planItems = queryAll(
    'SELECT * FROM meal_plans WHERE user_id = ? AND day_of_week = ? ORDER BY order_index ASC',
    [req.userId, day]
  );

  const createdLogs = transaction(() => {
    const inserted = [];
    for (const item of planItems) {
      const logRes = execute(
        `INSERT INTO food_logs (
          user_id, date, meal_type, food_id, food_name, servings, serving_size, serving_unit,
          calories, protein_g, carbs_g, fat_g, fiber_g, notes
        ) VALUES (?, ?, ?, ?, ?, ?, 100, ?, ?, ?, ?, ?, 0, ?)`,
        [
          req.userId,
          dateStr,
          item.meal_type,
          item.food_id,
          item.meal_name,
          item.servings,
          item.serving_unit,
          item.calories,
          item.protein_g,
          item.carbs_g,
          item.fat_g,
          item.prep_notes || `Logged from ${day} meal plan`,
        ]
      );
      execute('UPDATE meal_plans SET is_completed = 1 WHERE id = ? AND user_id = ?', [item.id, req.userId]);
      inserted.push(queryOne('SELECT * FROM food_logs WHERE id = ?', [Number(logRes.lastInsertRowid)]));
    }
    return inserted;
  });

  res.status(201).json({
    day_of_week: day,
    date: dateStr,
    logged_count: createdLogs.length,
    entries: createdLogs,
  });
});

// DELETE /api/meal-plans/:id
router.delete('/meal-plans/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = queryOne('SELECT * FROM meal_plans WHERE id = ? AND user_id = ?', [id, req.userId]);
  if (!existing) return res.status(404).json({ error: 'Meal plan item not found' });

  execute('DELETE FROM meal_plans WHERE id = ? AND user_id = ?', [id, req.userId]);
  res.json({ deleted: true, id });
});

module.exports = {
  router,
  getWeeklyMealPlan,
};
