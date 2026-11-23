const express = require('express');
const router = express.Router();
const { queryAll, queryOne, execute } = require('../db');
const { getTodayDateString } = require('../utils/calculations');

function buildDailyNutritionSummary(dateStr) {
  const profile = queryOne('SELECT * FROM user_profile WHERE id = 1');
  const logs = queryAll(
    'SELECT * FROM food_logs WHERE date = ? ORDER BY id ASC',
    [dateStr]
  );

  const meals = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };

  const consumed = {
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
  };

  for (const item of logs) {
    const type = meals[item.meal_type] ? item.meal_type : 'snack';
    meals[type].push(item);
    consumed.calories += Number(item.calories || 0);
    consumed.protein_g += Number(item.protein_g || 0);
    consumed.carbs_g += Number(item.carbs_g || 0);
    consumed.fat_g += Number(item.fat_g || 0);
    consumed.fiber_g += Number(item.fiber_g || 0);
  }

  consumed.calories = Math.round(consumed.calories);
  consumed.protein_g = Number(consumed.protein_g.toFixed(1));
  consumed.carbs_g = Number(consumed.carbs_g.toFixed(1));
  consumed.fat_g = Number(consumed.fat_g.toFixed(1));
  consumed.fiber_g = Number(consumed.fiber_g.toFixed(1));

  const targets = {
    calories: profile?.daily_calorie_target || 2200,
    protein_g: profile?.daily_protein_g || 180,
    carbs_g: profile?.daily_carbs_g || 220,
    fat_g: profile?.daily_fat_g || 65,
    fiber_g: profile?.daily_fiber_g || 30,
  };

  const remaining = {
    calories: Math.round(targets.calories - consumed.calories),
    protein_g: Number((targets.protein_g - consumed.protein_g).toFixed(1)),
    carbs_g: Number((targets.carbs_g - consumed.carbs_g).toFixed(1)),
    fat_g: Number((targets.fat_g - consumed.fat_g).toFixed(1)),
    fiber_g: Number((targets.fiber_g - consumed.fiber_g).toFixed(1)),
  };

  const percentages = {
    calories: targets.calories > 0 ? Math.round((consumed.calories / targets.calories) * 100) : 0,
    protein_g: targets.protein_g > 0 ? Math.round((consumed.protein_g / targets.protein_g) * 100) : 0,
    carbs_g: targets.carbs_g > 0 ? Math.round((consumed.carbs_g / targets.carbs_g) * 100) : 0,
    fat_g: targets.fat_g > 0 ? Math.round((consumed.fat_g / targets.fat_g) * 100) : 0,
    fiber_g: targets.fiber_g > 0 ? Math.round((consumed.fiber_g / targets.fiber_g) * 100) : 0,
  };

  return {
    date: dateStr,
    consumed,
    targets,
    remaining,
    percentages,
    meals,
    items: logs,
    total_items: logs.length,
  };
}

// GET /api/foods
router.get('/foods', (req, res) => {
  const { q, category, favorites_only } = req.query;
  const conditions = [];
  const params = [];

  if (q && String(q).trim()) {
    conditions.push('(LOWER(name) LIKE ? OR LOWER(category) LIKE ?)');
    const term = `%${String(q).toLowerCase().trim()}%`;
    params.push(term, term);
  }
  if (category && category !== 'All') {
    conditions.push('category = ?');
    params.push(category);
  }
  if (favorites_only === 'true' || favorites_only === '1') {
    conditions.push('is_favorite = 1');
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const items = queryAll(
    `SELECT * FROM foods ${whereClause} ORDER BY is_favorite DESC, name ASC`,
    params
  );

  const catRows = queryAll('SELECT DISTINCT category FROM foods ORDER BY category ASC');
  const categories = catRows.map((r) => r.category);

  res.json({
    items,
    categories,
    total: items.length,
  });
});

// GET /api/foods/:id
router.get('/foods/:id', (req, res) => {
  const item = queryOne('SELECT * FROM foods WHERE id = ?', [Number(req.params.id)]);
  if (!item) return res.status(404).json({ error: 'Food item not found' });
  res.json(item);
});

// POST /api/foods
router.post('/foods', (req, res) => {
  const {
    name,
    category = 'Custom',
    serving_size = 100,
    serving_unit = 'g',
    calories = 0,
    protein_g = 0,
    carbs_g = 0,
    fat_g = 0,
    fiber_g = 0,
    is_favorite = 0,
  } = req.body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Food name is required' });
  }

  const result = execute(
    `INSERT INTO foods (
      name, category, serving_size, serving_unit,
      calories, protein_g, carbs_g, fat_g, fiber_g, is_favorite, is_custom
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      String(name).trim(),
      String(category).trim(),
      Number(serving_size),
      String(serving_unit).trim(),
      Math.round(Number(calories)),
      Number(protein_g),
      Number(carbs_g),
      Number(fat_g),
      Number(fiber_g),
      is_favorite ? 1 : 0,
    ]
  );

  const created = queryOne('SELECT * FROM foods WHERE id = ?', [Number(result.lastInsertRowid)]);
  res.status(201).json(created);
});

// PUT /api/foods/:id
router.put('/foods/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = queryOne('SELECT * FROM foods WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Food item not found' });

  execute(
    `UPDATE foods
     SET name = ?, category = ?, serving_size = ?, serving_unit = ?,
         calories = ?, protein_g = ?, carbs_g = ?, fat_g = ?, fiber_g = ?, is_favorite = ?
     WHERE id = ?`,
    [
      req.body.name ?? existing.name,
      req.body.category ?? existing.category,
      Number(req.body.serving_size ?? existing.serving_size),
      req.body.serving_unit ?? existing.serving_unit,
      Math.round(Number(req.body.calories ?? existing.calories)),
      Number(req.body.protein_g ?? existing.protein_g),
      Number(req.body.carbs_g ?? existing.carbs_g),
      Number(req.body.fat_g ?? existing.fat_g),
      Number(req.body.fiber_g ?? existing.fiber_g),
      req.body.is_favorite !== undefined ? (req.body.is_favorite ? 1 : 0) : existing.is_favorite,
      id,
    ]
  );

  res.json(queryOne('SELECT * FROM foods WHERE id = ?', [id]));
});

// PATCH /api/foods/:id/favorite
router.patch('/foods/:id/favorite', (req, res) => {
  const id = Number(req.params.id);
  const existing = queryOne('SELECT * FROM foods WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Food item not found' });

  const nextFav =
    req.body.is_favorite !== undefined
      ? req.body.is_favorite
        ? 1
        : 0
      : existing.is_favorite
      ? 0
      : 1;

  execute('UPDATE foods SET is_favorite = ? WHERE id = ?', [nextFav, id]);
  res.json(queryOne('SELECT * FROM foods WHERE id = ?', [id]));
});

// DELETE /api/foods/:id
router.delete('/foods/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = queryOne('SELECT * FROM foods WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Food item not found' });

  execute('DELETE FROM foods WHERE id = ?', [id]);
  res.json({ deleted: true, id });
});

// GET /api/food-logs?date=YYYY-MM-DD
router.get('/food-logs', (req, res) => {
  const dateStr = req.query.date || getTodayDateString();
  res.json(buildDailyNutritionSummary(dateStr));
});

// POST /api/food-logs
router.post('/food-logs', (req, res) => {
  const dateStr = req.body.date || getTodayDateString();
  const meal_type = ['breakfast', 'lunch', 'dinner', 'snack'].includes(req.body.meal_type)
    ? req.body.meal_type
    : 'breakfast';
  const servings = Number(req.body.servings ?? 1);

  let food_id = req.body.food_id ? Number(req.body.food_id) : null;
  let food_name = req.body.food_name;
  let serving_size = Number(req.body.serving_size ?? 100);
  let serving_unit = req.body.serving_unit || 'g';
  let calories = Number(req.body.calories ?? 0);
  let protein_g = Number(req.body.protein_g ?? 0);
  let carbs_g = Number(req.body.carbs_g ?? 0);
  let fat_g = Number(req.body.fat_g ?? 0);
  let fiber_g = Number(req.body.fiber_g ?? 0);

  if (food_id) {
    const catalogFood = queryOne('SELECT * FROM foods WHERE id = ?', [food_id]);
    if (!catalogFood) {
      return res.status(404).json({ error: 'Referenced food_id not found' });
    }
    food_name = food_name || catalogFood.name;
    serving_size = catalogFood.serving_size;
    serving_unit = catalogFood.serving_unit;
    if (req.body.calories === undefined) {
      calories = Math.round(catalogFood.calories * servings);
      protein_g = Number((catalogFood.protein_g * servings).toFixed(1));
      carbs_g = Number((catalogFood.carbs_g * servings).toFixed(1));
      fat_g = Number((catalogFood.fat_g * servings).toFixed(1));
      fiber_g = Number((catalogFood.fiber_g * servings).toFixed(1));
    }
  }

  if (!food_name || !String(food_name).trim()) {
    return res.status(400).json({ error: 'food_name or valid food_id is required' });
  }

  const result = execute(
    `INSERT INTO food_logs (
      date, meal_type, food_id, food_name, servings, serving_size, serving_unit,
      calories, protein_g, carbs_g, fat_g, fiber_g, notes, image_data
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      dateStr,
      meal_type,
      food_id,
      String(food_name).trim(),
      servings,
      serving_size,
      serving_unit,
      Math.round(calories),
      protein_g,
      carbs_g,
      fat_g,
      fiber_g,
      req.body.notes || '',
      req.body.image_data || '',
    ]
  );

  const created = queryOne('SELECT * FROM food_logs WHERE id = ?', [Number(result.lastInsertRowid)]);
  res.status(201).json({
    entry: created,
    summary: buildDailyNutritionSummary(dateStr),
  });
});

// PUT /api/food-logs/:id
router.put('/food-logs/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = queryOne('SELECT * FROM food_logs WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Food log entry not found' });

  const servings = Number(req.body.servings ?? existing.servings);
  const meal_type = req.body.meal_type ?? existing.meal_type;
  const notes = req.body.notes ?? existing.notes;
  let calories = req.body.calories !== undefined ? Number(req.body.calories) : existing.calories;
  let protein_g = req.body.protein_g !== undefined ? Number(req.body.protein_g) : existing.protein_g;
  let carbs_g = req.body.carbs_g !== undefined ? Number(req.body.carbs_g) : existing.carbs_g;
  let fat_g = req.body.fat_g !== undefined ? Number(req.body.fat_g) : existing.fat_g;
  let fiber_g = req.body.fiber_g !== undefined ? Number(req.body.fiber_g) : existing.fiber_g;

  if (req.body.servings !== undefined && req.body.calories === undefined && existing.food_id) {
    const catalogFood = queryOne('SELECT * FROM foods WHERE id = ?', [existing.food_id]);
    if (catalogFood) {
      calories = Math.round(catalogFood.calories * servings);
      protein_g = Number((catalogFood.protein_g * servings).toFixed(1));
      carbs_g = Number((catalogFood.carbs_g * servings).toFixed(1));
      fat_g = Number((catalogFood.fat_g * servings).toFixed(1));
      fiber_g = Number((catalogFood.fiber_g * servings).toFixed(1));
    }
  }

  execute(
    `UPDATE food_logs
     SET meal_type = ?, food_name = ?, servings = ?, calories = ?,
         protein_g = ?, carbs_g = ?, fat_g = ?, fiber_g = ?, notes = ?
     WHERE id = ?`,
    [
      meal_type,
      req.body.food_name ?? existing.food_name,
      servings,
      Math.round(calories),
      protein_g,
      carbs_g,
      fat_g,
      fiber_g,
      notes,
      id,
    ]
  );

  const updated = queryOne('SELECT * FROM food_logs WHERE id = ?', [id]);
  res.json({
    entry: updated,
    summary: buildDailyNutritionSummary(updated.date),
  });
});

// DELETE /api/food-logs/:id
router.delete('/food-logs/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = queryOne('SELECT * FROM food_logs WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Food log entry not found' });

  execute('DELETE FROM food_logs WHERE id = ?', [id]);
  res.json({
    deleted: true,
    id,
    summary: buildDailyNutritionSummary(existing.date),
  });
});

module.exports = {
  router,
  buildDailyNutritionSummary,
};
