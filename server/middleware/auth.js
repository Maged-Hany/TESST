const crypto = require('node:crypto');
const { queryAll, queryOne, execute, transaction } = require('../db');
const { getTodayDateString } = require('../utils/calculations');
const { addDays, readDate } = require('../utils/validate');
const { SPLIT_PRESETS } = require('../utils/workoutCatalog');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, keyHex] = storedHash.split(':');
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(String(password), salt, keyBuf.length);
  return keyBuf.length === derivedBuf.length && crypto.timingSafeEqual(keyBuf, derivedBuf);
}

function sanitizeUser(row) {
  if (!row) return null;
  const { password_hash, ...safe } = row;
  return safe;
}

function seedUserInitialPlans(userId, splitKey = 'ppl') {
  const preset = SPLIT_PRESETS[splitKey] || SPLIT_PRESETS.ppl;
  const allExercises = queryAll('SELECT id, name FROM exercises');
  const exByName = new Map(allExercises.map((e) => [e.name.toLowerCase(), e.id]));

  execute('DELETE FROM workout_plans WHERE user_id = ?', [userId]);

  for (const dayDef of preset.days) {
    const resPlan = execute(
      `INSERT INTO workout_plans (
        user_id, day_of_week, title, focus_area, estimated_duration_min, is_rest_day, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        dayDef.day_of_week,
        dayDef.title,
        dayDef.focus_area,
        dayDef.estimated_duration_min,
        dayDef.is_rest_day ? 1 : 0,
        dayDef.notes || '',
      ]
    );
    const planId = Number(resPlan.lastInsertRowid);
    (dayDef.items || []).forEach(([exName, sets, reps, weight], idx) => {
      const exId = exByName.get(exName.toLowerCase());
      if (exId) {
        execute(
          `INSERT INTO workout_plan_exercises (
            workout_plan_id, exercise_id, order_index, target_sets, target_reps, target_weight_kg, rest_seconds, notes
          ) VALUES (?, ?, ?, ?, ?, ?, 90, '')`,
          [planId, exId, idx, sets, String(reps), Number(weight || 0)]
        );
      }
    });
  }

  // Seed default weekly meal plans for a new user if they have none yet
  const existingMeals = queryOne('SELECT COUNT(*) AS cnt FROM meal_plans WHERE user_id = ?', [userId]);
  if (!existingMeals || existingMeals.cnt === 0) {
    const templateMeals = queryAll('SELECT * FROM meal_plans WHERE user_id = 0 ORDER BY id ASC');
    for (const m of templateMeals) {
      execute(
        `INSERT INTO meal_plans (
          user_id, day_of_week, meal_type, food_id, meal_name, servings, serving_unit,
          calories, protein_g, carbs_g, fat_g, prep_notes, is_completed, order_index
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [
          userId,
          m.day_of_week,
          m.meal_type,
          m.food_id,
          m.meal_name,
          m.servings,
          m.serving_unit,
          m.calories,
          m.protein_g,
          m.carbs_g,
          m.fat_g,
          m.prep_notes || '',
          m.order_index || 0,
        ]
      );
    }
  }
}

function getProfileRow(userId = 0) {
  if (userId > 0) {
    return queryOne('SELECT * FROM users WHERE id = ?', [userId]);
  }
  return queryOne('SELECT * FROM user_profile WHERE id = 1');
}

function computeStreakSnapshot(userId = 0, referenceDate = getTodayDateString()) {
  const rows = queryAll(
    'SELECT date FROM streak_days WHERE user_id = ? ORDER BY date DESC',
    [userId]
  );
  const dateSet = new Set(rows.map((r) => r.date));

  let currentStreak = 0;
  // A streak is active if logged on referenceDate or yesterday relative to referenceDate
  let cursor = dateSet.has(referenceDate)
    ? referenceDate
    : dateSet.has(addDays(referenceDate, -1))
    ? addDays(referenceDate, -1)
    : null;

  while (cursor && dateSet.has(cursor)) {
    currentStreak += 1;
    cursor = addDays(cursor, -1);
  }

  const profileRow = getProfileRow(userId);
  const longestStreak = Math.max(Number(profileRow?.longest_streak || 0), currentStreak);

  // Build last 7 days strip ending on referenceDate
  const week = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = addDays(referenceDate, -i);
    week.push({ date: d, logged: dateSet.has(d) });
  }

  return {
    current_streak: currentStreak,
    longest_streak: longestStreak,
    is_elite: currentStreak > 10,
    last_streak_date: rows[0]?.date || '',
    week,
  };
}

function recordStreakActivity(userId = 0, rawDate, source = 'workout') {
  const todayStr = getTodayDateString();
  const dateStr = readDate(rawDate, todayStr, 'date');
  const before = computeStreakSnapshot(userId, dateStr);
  const alreadyHadDate = queryOne(
    'SELECT id FROM streak_days WHERE user_id = ? AND date = ?',
    [userId, dateStr]
  );

  execute(
    'INSERT OR IGNORE INTO streak_days (user_id, date, source) VALUES (?, ?, ?)',
    [userId, dateStr, source]
  );

  const after = computeStreakSnapshot(userId, dateStr);

  if (userId > 0) {
    execute(
      `UPDATE users
       SET current_streak = ?, longest_streak = ?, last_streak_date = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [after.current_streak, after.longest_streak, after.last_streak_date, userId]
    );
  } else {
    execute(
      `UPDATE user_profile
       SET current_streak = ?, longest_streak = ?, last_streak_date = ?, updated_at = datetime('now')
       WHERE id = 1`,
      [after.current_streak, after.longest_streak, after.last_streak_date]
    );
  }

  // Trigger "You got a streak" popup when:
  // - On login: user logs in on a 2nd+ consecutive day (streak increased and >= 2)
  // - On workout log: user logs a new workout day that advances their streak (>= 1)
  const grew = !alreadyHadDate && after.current_streak > before.current_streak;
  const streakExtended =
    source === 'workout' ? grew && after.current_streak >= 1 : grew && after.current_streak >= 2;

  return {
    ...after,
    streak_extended: streakExtended,
    popup_message: streakExtended ? 'You got a streak' : '',
  };
}

function attachAuth(req, res, next) {
  req.user = null;
  req.userId = 0;

  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    if (token) {
      const session = queryOne('SELECT user_id FROM auth_sessions WHERE token = ?', [token]);
      if (session) {
        const userRow = queryOne('SELECT * FROM users WHERE id = ?', [session.user_id]);
        if (userRow) {
          req.user = sanitizeUser(userRow);
          req.userId = userRow.id;
          req.authToken = token;
        }
      }
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Sign in required' });
  }
  next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  sanitizeUser,
  seedUserInitialPlans,
  getProfileRow,
  computeStreakSnapshot,
  recordStreakActivity,
  attachAuth,
  requireAuth,
};
