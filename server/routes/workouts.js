const express = require('express');
const router = express.Router();
const { queryAll, queryOne, execute, transaction } = require('../db');
const { calculate1RM, getTodayDateString } = require('../utils/calculations');
const { MUSCLE_GROUPS_ORDERED, SPLIT_PRESETS } = require('../utils/workoutCatalog');
const { seedUserInitialPlans, getProfileRow, recordStreakActivity } = require('../middleware/auth');

const DAYS_ORDERED = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function getWorkoutPlanWithExercises(planId) {
  const plan = queryOne('SELECT * FROM workout_plans WHERE id = ?', [planId]);
  if (!plan) return null;
  const exercises = queryAll(
    `SELECT wpe.*, e.name AS exercise_name, e.muscle_group, e.equipment, e.movement_type, e.instructions, e.youtube_id
     FROM workout_plan_exercises wpe
     JOIN exercises e ON e.id = wpe.exercise_id
     WHERE wpe.workout_plan_id = ?
     ORDER BY wpe.order_index ASC, wpe.id ASC`,
    [plan.id]
  );
  return {
    ...plan,
    exercises,
  };
}

function getAllWorkoutPlans(userId = 0) {
  let plans = queryAll('SELECT * FROM workout_plans WHERE user_id = ?', [userId]);
  if (plans.length === 0 && userId > 0) {
    seedUserInitialPlans(userId, 'ppl');
    plans = queryAll('SELECT * FROM workout_plans WHERE user_id = ?', [userId]);
  }
  const sorted = plans.sort(
    (a, b) => DAYS_ORDERED.indexOf(a.day_of_week) - DAYS_ORDERED.indexOf(b.day_of_week)
  );
  return sorted.map((p) => getWorkoutPlanWithExercises(p.id));
}

function enrichWorkoutLog(logRow) {
  if (!logRow) return null;
  const sets = queryAll(
    `SELECT wls.*, e.muscle_group, e.equipment, e.youtube_id
     FROM workout_log_sets wls
     LEFT JOIN exercises e ON e.id = wls.exercise_id
     WHERE wls.workout_log_id = ?
     ORDER BY wls.id ASC`,
    [logRow.id]
  );

  let total_volume_kg = 0;
  let working_sets = 0;
  let pr_count = 0;
  const exerciseSet = new Set();

  for (const s of sets) {
    exerciseSet.add(s.exercise_name);
    if (!s.is_warmup) {
      working_sets += 1;
      total_volume_kg += Number(s.reps || 0) * Number(s.weight_kg || 0);
    }
    if (s.is_pr) pr_count += 1;
  }

  return {
    ...logRow,
    total_volume_kg: Math.round(total_volume_kg),
    total_sets: sets.length,
    working_sets,
    unique_exercises: exerciseSet.size,
    pr_count,
    sets,
  };
}

// GET /api/exercises
router.get('/exercises', (req, res) => {
  const { q, muscle_group, equipment, recommended_only } = req.query;
  const conditions = [];
  const params = [];

  if (q && String(q).trim()) {
    conditions.push('(LOWER(name) LIKE ? OR LOWER(muscle_group) LIKE ?)');
    const term = `%${String(q).toLowerCase().trim()}%`;
    params.push(term, term);
  }
  if (muscle_group && muscle_group !== 'All') {
    conditions.push('muscle_group = ?');
    params.push(muscle_group);
  }
  if (equipment && equipment !== 'All') {
    conditions.push('equipment = ?');
    params.push(equipment);
  }
  if (recommended_only === '1' || recommended_only === 'true') {
    conditions.push('is_recommended = 1');
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const items = queryAll(
    `SELECT * FROM exercises ${whereClause} ORDER BY is_recommended DESC, muscle_group ASC, id ASC`,
    params
  );

  const recommendedRows = queryAll(
    'SELECT * FROM exercises WHERE is_recommended = 1 ORDER BY id ASC'
  );
  const recommended_by_muscle = {};
  for (const mg of MUSCLE_GROUPS_ORDERED) {
    recommended_by_muscle[mg] = recommendedRows.filter((r) => r.muscle_group === mg).slice(0, 6);
  }

  const muscle_groups = queryAll('SELECT DISTINCT muscle_group FROM exercises ORDER BY muscle_group ASC').map(
    (r) => r.muscle_group
  );
  const equipment_types = queryAll('SELECT DISTINCT equipment FROM exercises ORDER BY equipment ASC').map(
    (r) => r.equipment
  );

  res.json({
    items,
    recommended_by_muscle,
    recommended_muscle_groups: MUSCLE_GROUPS_ORDERED,
    muscle_groups,
    equipment_types,
    total: items.length,
  });
});

// POST /api/exercises
router.post('/exercises', (req, res) => {
  const {
    name,
    muscle_group = 'Full Body',
    equipment = 'Dumbbell',
    movement_type = 'Compound',
    instructions = '',
    youtube_id = '',
  } = req.body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Exercise name is required' });
  }

  const result = execute(
    `INSERT INTO exercises (name, muscle_group, equipment, movement_type, instructions, youtube_id, is_custom)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    [
      String(name).trim(),
      String(muscle_group).trim(),
      String(equipment).trim(),
      String(movement_type).trim(),
      instructions,
      String(youtube_id || '').trim(),
    ]
  );

  res.status(201).json(queryOne('SELECT * FROM exercises WHERE id = ?', [Number(result.lastInsertRowid)]));
});

// GET /api/exercises/:id/history
router.get('/exercises/:id/history', (req, res) => {
  const exerciseId = Number(req.params.id);
  const exercise = queryOne('SELECT * FROM exercises WHERE id = ?', [exerciseId]);
  if (!exercise) return res.status(404).json({ error: 'Exercise not found' });

  const rows = queryAll(
    `SELECT wls.*, wl.date, wl.title AS workout_title
     FROM workout_log_sets wls
     JOIN workout_logs wl ON wl.id = wls.workout_log_id
     WHERE wls.exercise_id = ? AND wl.user_id = ?
     ORDER BY wl.date ASC, wls.set_number ASC`,
    [exerciseId, req.userId]
  );

  const byDate = {};
  for (const r of rows) {
    if (!byDate[r.date]) {
      byDate[r.date] = {
        date: r.date,
        workout_title: r.workout_title,
        max_weight_kg: 0,
        best_1rm_kg: 0,
        total_volume_kg: 0,
        total_sets: 0,
        sets: [],
      };
    }
    const bucket = byDate[r.date];
    bucket.sets.push(r);
    bucket.total_sets += 1;
    if (!r.is_warmup) {
      bucket.total_volume_kg += Number(r.reps) * Number(r.weight_kg);
      if (Number(r.weight_kg) > bucket.max_weight_kg) {
        bucket.max_weight_kg = Number(r.weight_kg);
      }
      if (Number(r.estimated_1rm) > bucket.best_1rm_kg) {
        bucket.best_1rm_kg = Number(r.estimated_1rm);
      }
    }
  }

  res.json({
    exercise,
    history: Object.values(byDate),
  });
});

// GET /api/workout-plans
router.get('/workout-plans', (req, res) => {
  res.json(getAllWorkoutPlans(req.userId));
});

// POST /api/workout-plans/apply-split — Switch between PPL, Upper/Lower, Arnold, Bro Split, Full Body, or Custom
router.post('/workout-plans/apply-split', (req, res) => {
  const splitKey = String(req.body?.split_method || 'ppl').toLowerCase();
  if (!SPLIT_PRESETS[splitKey]) {
    return res.status(400).json({
      error: `split_method must be one of: ${Object.keys(SPLIT_PRESETS).join(', ')}`,
    });
  }

  transaction(() => {
    seedUserInitialPlans(req.userId, splitKey);
    if (req.userId > 0) {
      execute("UPDATE users SET split_method = ?, updated_at = datetime('now') WHERE id = ?", [
        splitKey,
        req.userId,
      ]);
    } else {
      execute("UPDATE user_profile SET split_method = ?, updated_at = datetime('now') WHERE id = 1", [
        splitKey,
      ]);
    }
  });

  res.json({
    split_method: splitKey,
    label: SPLIT_PRESETS[splitKey].label,
    plans: getAllWorkoutPlans(req.userId),
  });
});

// GET /api/workout-plans/:id
router.get('/workout-plans/:id', (req, res) => {
  const plan = getWorkoutPlanWithExercises(Number(req.params.id));
  if (!plan || plan.user_id !== req.userId) {
    return res.status(404).json({ error: 'Workout plan not found' });
  }
  res.json(plan);
});

// POST /api/workout-plans (Create or upsert by day_of_week)
router.post('/workout-plans', (req, res) => {
  const day_of_week = String(req.body.day_of_week || 'monday').toLowerCase();
  if (!DAYS_ORDERED.includes(day_of_week)) {
    return res.status(400).json({ error: 'Invalid day_of_week' });
  }

  const existing = queryOne(
    'SELECT * FROM workout_plans WHERE user_id = ? AND day_of_week = ?',
    [req.userId, day_of_week]
  );

  const planId = transaction(() => {
    let id;
    if (existing) {
      execute(
        `UPDATE workout_plans
         SET title = ?, focus_area = ?, estimated_duration_min = ?, is_rest_day = ?, notes = ?
         WHERE id = ? AND user_id = ?`,
        [
          req.body.title ?? existing.title,
          req.body.focus_area ?? existing.focus_area,
          Number(req.body.estimated_duration_min ?? existing.estimated_duration_min),
          req.body.is_rest_day ? 1 : 0,
          req.body.notes ?? existing.notes,
          existing.id,
          req.userId,
        ]
      );
      id = existing.id;
    } else {
      const resInsert = execute(
        `INSERT INTO workout_plans (user_id, day_of_week, title, focus_area, estimated_duration_min, is_rest_day, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          req.userId,
          day_of_week,
          req.body.title || 'Workout Session',
          req.body.focus_area || 'General Fitness',
          Number(req.body.estimated_duration_min ?? 60),
          req.body.is_rest_day ? 1 : 0,
          req.body.notes || '',
        ]
      );
      id = Number(resInsert.lastInsertRowid);
    }

    if (Array.isArray(req.body.exercises)) {
      execute('DELETE FROM workout_plan_exercises WHERE workout_plan_id = ?', [id]);
      req.body.exercises.forEach((ex, idx) => {
        execute(
          `INSERT INTO workout_plan_exercises (
            workout_plan_id, exercise_id, order_index, target_sets, target_reps, target_weight_kg, rest_seconds, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            Number(ex.exercise_id),
            Number(ex.order_index ?? idx),
            Number(ex.target_sets ?? 3),
            String(ex.target_reps ?? '8-10'),
            Number(ex.target_weight_kg ?? 0),
            Number(ex.rest_seconds ?? 90),
            ex.notes || '',
          ]
        );
      });
    }

    return id;
  });

  res.status(existing ? 200 : 201).json(getWorkoutPlanWithExercises(planId));
});

// PUT /api/workout-plans/:id
router.put('/workout-plans/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = queryOne('SELECT * FROM workout_plans WHERE id = ? AND user_id = ?', [id, req.userId]);
  if (!existing) return res.status(404).json({ error: 'Workout plan not found' });

  transaction(() => {
    execute(
      `UPDATE workout_plans
       SET title = ?, focus_area = ?, estimated_duration_min = ?, is_rest_day = ?, notes = ?
       WHERE id = ? AND user_id = ?`,
      [
        req.body.title ?? existing.title,
        req.body.focus_area ?? existing.focus_area,
        Number(req.body.estimated_duration_min ?? existing.estimated_duration_min),
        req.body.is_rest_day !== undefined ? (req.body.is_rest_day ? 1 : 0) : existing.is_rest_day,
        req.body.notes ?? existing.notes,
        id,
        req.userId,
      ]
    );

    if (Array.isArray(req.body.exercises)) {
      execute('DELETE FROM workout_plan_exercises WHERE workout_plan_id = ?', [id]);
      req.body.exercises.forEach((ex, idx) => {
        execute(
          `INSERT INTO workout_plan_exercises (
            workout_plan_id, exercise_id, order_index, target_sets, target_reps, target_weight_kg, rest_seconds, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            Number(ex.exercise_id),
            Number(ex.order_index ?? idx),
            Number(ex.target_sets ?? 3),
            String(ex.target_reps ?? '8-10'),
            Number(ex.target_weight_kg ?? 0),
            Number(ex.rest_seconds ?? 90),
            ex.notes || '',
          ]
        );
      });
    }
  });

  res.json(getWorkoutPlanWithExercises(id));
});

// POST /api/workout-plans/:id/exercises — Supports recommended exercise_id OR manual exercise_name
router.post('/workout-plans/:id/exercises', (req, res) => {
  const planId = Number(req.params.id);
  const existing = queryOne('SELECT * FROM workout_plans WHERE id = ? AND user_id = ?', [planId, req.userId]);
  if (!existing) return res.status(404).json({ error: 'Workout plan not found' });

  let exerciseId = req.body.exercise_id ? Number(req.body.exercise_id) : null;
  let exercise = exerciseId ? queryOne('SELECT * FROM exercises WHERE id = ?', [exerciseId]) : null;

  // Support adding any custom manual workout directly by name
  if (!exercise && req.body.exercise_name && String(req.body.exercise_name).trim()) {
    const cleanName = String(req.body.exercise_name).trim();
    exercise = queryOne('SELECT * FROM exercises WHERE LOWER(name) = LOWER(?)', [cleanName]);
    if (!exercise) {
      const ins = execute(
        `INSERT INTO exercises (name, muscle_group, equipment, movement_type, instructions, is_custom)
         VALUES (?, ?, ?, 'Compound', '', 1)`,
        [cleanName, String(req.body.muscle_group || 'Custom').trim(), String(req.body.equipment || 'Custom').trim()]
      );
      exerciseId = Number(ins.lastInsertRowid);
      exercise = queryOne('SELECT * FROM exercises WHERE id = ?', [exerciseId]);
    } else {
      exerciseId = exercise.id;
    }
  }

  if (!exercise) return res.status(404).json({ error: 'Select an exercise or enter a workout name' });

  // Automatically flip a Rest day to a Training day when an exercise is added
  if (existing.is_rest_day) {
    execute('UPDATE workout_plans SET is_rest_day = 0 WHERE id = ?', [planId]);
  }

  const countRow = queryOne(
    'SELECT COUNT(*) AS cnt FROM workout_plan_exercises WHERE workout_plan_id = ?',
    [planId]
  );

  execute(
    `INSERT INTO workout_plan_exercises (
      workout_plan_id, exercise_id, order_index, target_sets, target_reps, target_weight_kg, rest_seconds, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      planId,
      exerciseId,
      Number(req.body.order_index ?? countRow.cnt),
      Number(req.body.target_sets ?? 3),
      String(req.body.target_reps ?? '8-10'),
      Number(req.body.target_weight_kg ?? 0),
      Number(req.body.rest_seconds ?? 90),
      req.body.notes || '',
    ]
  );

  res.status(201).json(getWorkoutPlanWithExercises(planId));
});

// PUT /api/workout-plans/:planId/exercises/:itemId
router.put('/workout-plans/:planId/exercises/:itemId', (req, res) => {
  const planId = Number(req.params.planId);
  const itemId = Number(req.params.itemId);
  const planOwner = queryOne('SELECT id FROM workout_plans WHERE id = ? AND user_id = ?', [planId, req.userId]);
  if (!planOwner) return res.status(404).json({ error: 'Workout plan not found' });

  const existing = queryOne(
    'SELECT * FROM workout_plan_exercises WHERE id = ? AND workout_plan_id = ?',
    [itemId, planId]
  );
  if (!existing) return res.status(404).json({ error: 'Planned exercise not found' });

  execute(
    `UPDATE workout_plan_exercises
     SET exercise_id = ?, order_index = ?, target_sets = ?, target_reps = ?,
         target_weight_kg = ?, rest_seconds = ?, notes = ?
     WHERE id = ?`,
    [
      Number(req.body.exercise_id ?? existing.exercise_id),
      Number(req.body.order_index ?? existing.order_index),
      Number(req.body.target_sets ?? existing.target_sets),
      String(req.body.target_reps ?? existing.target_reps),
      Number(req.body.target_weight_kg ?? existing.target_weight_kg),
      Number(req.body.rest_seconds ?? existing.rest_seconds),
      req.body.notes ?? existing.notes,
      itemId,
    ]
  );

  res.json(getWorkoutPlanWithExercises(planId));
});

// DELETE /api/workout-plans/:planId/exercises/:itemId
router.delete('/workout-plans/:planId/exercises/:itemId', (req, res) => {
  const planId = Number(req.params.planId);
  const itemId = Number(req.params.itemId);
  const planOwner = queryOne('SELECT id FROM workout_plans WHERE id = ? AND user_id = ?', [planId, req.userId]);
  if (!planOwner) return res.status(404).json({ error: 'Workout plan not found' });

  execute('DELETE FROM workout_plan_exercises WHERE id = ? AND workout_plan_id = ?', [itemId, planId]);
  res.json(getWorkoutPlanWithExercises(planId));
});

// GET /api/workout-logs
router.get('/workout-logs', (req, res) => {
  const { date, from, to, limit = 25 } = req.query;
  const conditions = ['user_id = ?'];
  const params = [req.userId];

  if (date) {
    conditions.push('date = ?');
    params.push(date);
  }
  if (from) {
    conditions.push('date >= ?');
    params.push(from);
  }
  if (to) {
    conditions.push('date <= ?');
    params.push(to);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  params.push(Number(limit));

  const logs = queryAll(
    `SELECT * FROM workout_logs ${whereClause} ORDER BY date DESC, id DESC LIMIT ?`,
    params
  );

  res.json(logs.map(enrichWorkoutLog));
});

// GET /api/workout-logs/:id
router.get('/workout-logs/:id', (req, res) => {
  const row = queryOne('SELECT * FROM workout_logs WHERE id = ? AND user_id = ?', [
    Number(req.params.id),
    req.userId,
  ]);
  if (!row) return res.status(404).json({ error: 'Workout log not found' });
  res.json(enrichWorkoutLog(row));
});

// POST /api/workout-logs — Logs a workout session and updates the account's streak!
router.post('/workout-logs', (req, res) => {
  const dateStr = req.body.date || getTodayDateString();
  const planId = req.body.workout_plan_id || req.body.from_workout_plan_id || null;
  let plan = null;
  if (planId) {
    const candidate = getWorkoutPlanWithExercises(Number(planId));
    if (candidate && candidate.user_id === req.userId) plan = candidate;
  }

  const title = req.body.title || plan?.title || 'Strength Training Session';
  const focus_area = req.body.focus_area || plan?.focus_area || 'Full Body';
  const duration_min = Number(req.body.duration_min ?? plan?.estimated_duration_min ?? 60);
  const calories_burned = Number(req.body.calories_burned ?? Math.round(duration_min * 6.5));
  const notes = req.body.notes || '';

  let setsToInsert = Array.isArray(req.body.sets) ? req.body.sets : [];

  if (setsToInsert.length === 0 && plan && Array.isArray(plan.exercises)) {
    for (const pEx of plan.exercises) {
      const parsedReps = parseInt(String(pEx.target_reps).split('-')[0], 10) || 10;
      for (let sNum = 1; sNum <= pEx.target_sets; sNum++) {
        setsToInsert.push({
          exercise_id: pEx.exercise_id,
          exercise_name: pEx.exercise_name,
          set_number: sNum,
          reps: parsedReps,
          weight_kg: pEx.target_weight_kg,
          rpe: 8.0,
          is_warmup: 0,
        });
      }
    }
  }

  const createdLogId = transaction(() => {
    const insertRes = execute(
      `INSERT INTO workout_logs (
        user_id, date, workout_plan_id, title, focus_area, duration_min, calories_burned, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.userId, dateStr, plan ? plan.id : null, title, focus_area, duration_min, calories_burned, notes]
    );
    const logId = Number(insertRes.lastInsertRowid);

    for (let i = 0; i < setsToInsert.length; i++) {
      const s = setsToInsert[i];
      let exId = s.exercise_id ? Number(s.exercise_id) : null;
      let exName = s.exercise_name;
      if (exId && !exName) {
        const exRow = queryOne('SELECT name FROM exercises WHERE id = ?', [exId]);
        exName = exRow ? exRow.name : 'Exercise';
      }
      exName = exName || 'Exercise';

      const reps = Number(s.reps ?? 10);
      const weight_kg = Number(s.weight_kg ?? 0);
      const is_warmup = s.is_warmup ? 1 : 0;
      const estimated_1rm = !is_warmup && weight_kg > 0 ? calculate1RM(weight_kg, reps).estimated_1rm : 0;

      let is_pr = s.is_pr ? 1 : 0;
      if (!is_warmup && exId && estimated_1rm > 0 && s.is_pr === undefined) {
        const prevBest = queryOne(
          `SELECT MAX(wls.estimated_1rm) AS best
           FROM workout_log_sets wls
           JOIN workout_logs wl ON wl.id = wls.workout_log_id
           WHERE wls.exercise_id = ? AND wls.is_warmup = 0 AND wl.user_id = ?`,
          [exId, req.userId]
        );
        if (!prevBest || !prevBest.best || estimated_1rm > Number(prevBest.best)) {
          is_pr = 1;
        }
      }

      execute(
        `INSERT INTO workout_log_sets (
          workout_log_id, exercise_id, exercise_name, set_number,
          reps, weight_kg, rpe, is_warmup, is_pr, estimated_1rm
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          logId,
          exId,
          exName,
          Number(s.set_number ?? i + 1),
          reps,
          weight_kg,
          Number(s.rpe ?? 8.0),
          is_warmup,
          is_pr,
          estimated_1rm,
        ]
      );
    }

    return logId;
  });

  // Record this workout date toward the user's streak!
  const streak = recordStreakActivity(req.userId, dateStr, 'workout');
  const createdRow = queryOne('SELECT * FROM workout_logs WHERE id = ?', [createdLogId]);

  res.status(201).json({
    ...enrichWorkoutLog(createdRow),
    streak,
  });
});

// PUT /api/workout-logs/:id
router.put('/workout-logs/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = queryOne('SELECT * FROM workout_logs WHERE id = ? AND user_id = ?', [id, req.userId]);
  if (!existing) return res.status(404).json({ error: 'Workout log not found' });

  transaction(() => {
    execute(
      `UPDATE workout_logs
       SET date = ?, title = ?, focus_area = ?, duration_min = ?, calories_burned = ?, notes = ?
       WHERE id = ? AND user_id = ?`,
      [
        req.body.date ?? existing.date,
        req.body.title ?? existing.title,
        req.body.focus_area ?? existing.focus_area,
        Number(req.body.duration_min ?? existing.duration_min),
        Number(req.body.calories_burned ?? existing.calories_burned),
        req.body.notes ?? existing.notes,
        id,
        req.userId,
      ]
    );

    if (Array.isArray(req.body.sets)) {
      execute('DELETE FROM workout_log_sets WHERE workout_log_id = ?', [id]);
      req.body.sets.forEach((s, idx) => {
        let exId = s.exercise_id ? Number(s.exercise_id) : null;
        let exName = s.exercise_name;
        if (exId && !exName) {
          const exRow = queryOne('SELECT name FROM exercises WHERE id = ?', [exId]);
          exName = exRow ? exRow.name : 'Exercise';
        }
        const reps = Number(s.reps ?? 10);
        const weight_kg = Number(s.weight_kg ?? 0);
        const is_warmup = s.is_warmup ? 1 : 0;
        const estimated_1rm = !is_warmup && weight_kg > 0 ? calculate1RM(weight_kg, reps).estimated_1rm : 0;

        execute(
          `INSERT INTO workout_log_sets (
            workout_log_id, exercise_id, exercise_name, set_number,
            reps, weight_kg, rpe, is_warmup, is_pr, estimated_1rm
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            exId,
            exName || 'Exercise',
            Number(s.set_number ?? idx + 1),
            reps,
            weight_kg,
            Number(s.rpe ?? 8.0),
            is_warmup,
            s.is_pr ? 1 : 0,
            estimated_1rm,
          ]
        );
      });
    }
  });

  res.json(enrichWorkoutLog(queryOne('SELECT * FROM workout_logs WHERE id = ?', [id])));
});

// DELETE /api/workout-logs/:id
router.delete('/workout-logs/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = queryOne('SELECT * FROM workout_logs WHERE id = ? AND user_id = ?', [id, req.userId]);
  if (!existing) return res.status(404).json({ error: 'Workout log not found' });

  execute('DELETE FROM workout_logs WHERE id = ? AND user_id = ?', [id, req.userId]);
  res.json({ deleted: true, id });
});

module.exports = {
  router,
  getWorkoutPlanWithExercises,
  getAllWorkoutPlans,
  enrichWorkoutLog,
};
