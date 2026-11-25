const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { RECOMMENDED_EXERCISES } = require('./utils/workoutCatalog');

const ROOT_DIR = path.resolve(__dirname, '..');
const DB_REL_PATH = process.env.DB_PATH || 'server/data/foody.sqlite';
const DB_PATH = path.isAbsolute(DB_REL_PATH)
  ? DB_REL_PATH
  : path.resolve(ROOT_DIR, DB_REL_PATH);

let dbInstance = null;

function ensureInitialized() {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  let needsSeed = !fs.existsSync(DB_PATH);
  if (!needsSeed) {
    try {
      const tempDb = new DatabaseSync(DB_PATH);
      const row = tempDb
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_profile'")
        .get();
      tempDb.close();
      if (!row) needsSeed = true;
    } catch {
      needsSeed = true;
    }
  }

  if (needsSeed) {
    runInitScript(path.resolve(ROOT_DIR, 'execution', 'init_db.py'));
  }
}

function runInitScript(initScript) {
  const candidates =
    process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];
  for (const cmd of candidates) {
    try {
      execFileSync(cmd, [initScript, '--db-path', DB_PATH], { stdio: 'inherit' });
      return;
    } catch (err) {
      if (err.code === 'ENOENT') continue;
      throw err;
    }
  }
  throw new Error(
    `Python 3 is required to create the database (tried: ${candidates.join(', ')}). ` +
      'Install Python 3 and restart the server.'
  );
}

function hasColumn(db, tableName, columnName) {
  const cols = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return cols.some((c) => c.name === columnName);
}

function runMigrations(db) {
  // 1. user_profile columns
  if (!hasColumn(db, 'user_profile', 'health_notes')) {
    db.exec("ALTER TABLE user_profile ADD COLUMN health_notes TEXT NOT NULL DEFAULT ''");
  }
  if (!hasColumn(db, 'user_profile', 'profile_completed')) {
    db.exec('ALTER TABLE user_profile ADD COLUMN profile_completed INTEGER NOT NULL DEFAULT 0');
  }
  if (!hasColumn(db, 'user_profile', 'split_method')) {
    db.exec("ALTER TABLE user_profile ADD COLUMN split_method TEXT NOT NULL DEFAULT 'ppl'");
  }
  if (!hasColumn(db, 'user_profile', 'current_streak')) {
    db.exec('ALTER TABLE user_profile ADD COLUMN current_streak INTEGER NOT NULL DEFAULT 0');
  }
  if (!hasColumn(db, 'user_profile', 'longest_streak')) {
    db.exec('ALTER TABLE user_profile ADD COLUMN longest_streak INTEGER NOT NULL DEFAULT 0');
  }
  if (!hasColumn(db, 'user_profile', 'last_streak_date')) {
    db.exec("ALTER TABLE user_profile ADD COLUMN last_streak_date TEXT NOT NULL DEFAULT ''");
  }

  // 2. Accounts, sessions & streak log tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      age INTEGER NOT NULL DEFAULT 27,
      gender TEXT NOT NULL DEFAULT 'male',
      height_cm REAL NOT NULL DEFAULT 178.0,
      weight_kg REAL NOT NULL DEFAULT 78.5,
      target_weight_kg REAL NOT NULL DEFAULT 75.0,
      activity_level TEXT NOT NULL DEFAULT 'moderate',
      goal TEXT NOT NULL DEFAULT 'cut',
      diet_preference TEXT NOT NULL DEFAULT 'high_protein',
      daily_calorie_target INTEGER NOT NULL DEFAULT 2290,
      daily_protein_g INTEGER NOT NULL DEFAULT 200,
      daily_carbs_g INTEGER NOT NULL DEFAULT 229,
      daily_fat_g INTEGER NOT NULL DEFAULT 64,
      daily_fiber_g INTEGER NOT NULL DEFAULT 32,
      daily_water_ml INTEGER NOT NULL DEFAULT 3250,
      health_notes TEXT NOT NULL DEFAULT '',
      profile_completed INTEGER NOT NULL DEFAULT 0,
      split_method TEXT NOT NULL DEFAULT 'ppl',
      current_streak INTEGER NOT NULL DEFAULT 0,
      longest_streak INTEGER NOT NULL DEFAULT 0,
      last_streak_date TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS streak_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 0,
      date TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'workout',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, date)
    );
  `);

  // 3. Per-user ownership columns (user_id = 0 for guest/default workspace)
  if (!hasColumn(db, 'food_logs', 'image_data')) {
    db.exec("ALTER TABLE food_logs ADD COLUMN image_data TEXT DEFAULT ''");
  }
  for (const tbl of ['food_logs', 'meal_plans', 'workout_logs', 'water_logs']) {
    if (!hasColumn(db, tbl, 'user_id')) {
      db.exec(`ALTER TABLE ${tbl} ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0`);
    }
  }

  // Migrate workout_plans from global UNIQUE(day_of_week) to per-user UNIQUE(user_id, day_of_week)
  if (!hasColumn(db, 'workout_plans', 'user_id')) {
    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec('BEGIN;');
    try {
      db.exec(`
        CREATE TABLE workout_plans_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL DEFAULT 0,
          day_of_week TEXT NOT NULL CHECK (day_of_week IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
          title TEXT NOT NULL,
          focus_area TEXT NOT NULL,
          estimated_duration_min INTEGER NOT NULL DEFAULT 60,
          is_rest_day INTEGER NOT NULL DEFAULT 0,
          notes TEXT DEFAULT '',
          UNIQUE(user_id, day_of_week)
        );
        INSERT INTO workout_plans_new (id, user_id, day_of_week, title, focus_area, estimated_duration_min, is_rest_day, notes)
        SELECT id, 0, day_of_week, title, focus_area, estimated_duration_min, is_rest_day, notes FROM workout_plans;
        DROP TABLE workout_plans;
        ALTER TABLE workout_plans_new RENAME TO workout_plans;
      `);
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    } finally {
      db.exec('PRAGMA foreign_keys = ON;');
    }
  }

  // 4. Exercise YouTube tutorial & 42 Recommended Popular Exercises (6 per muscle group)
  if (!hasColumn(db, 'exercises', 'youtube_id')) {
    db.exec("ALTER TABLE exercises ADD COLUMN youtube_id TEXT NOT NULL DEFAULT ''");
  }
  if (!hasColumn(db, 'exercises', 'is_recommended')) {
    db.exec('ALTER TABLE exercises ADD COLUMN is_recommended INTEGER NOT NULL DEFAULT 0');
  }

  // Ensure all 42 recommended exercises exist with accurate muscle_group & youtube_id
  const findByName = db.prepare('SELECT id FROM exercises WHERE LOWER(name) = LOWER(?)');
  const updateEx = db.prepare(
    `UPDATE exercises
     SET muscle_group = ?, equipment = ?, movement_type = ?, instructions = ?, youtube_id = ?, is_recommended = 1
     WHERE id = ?`
  );
  const insertEx = db.prepare(
    `INSERT INTO exercises (name, muscle_group, equipment, movement_type, instructions, youtube_id, is_recommended, is_custom)
     VALUES (?, ?, ?, ?, ?, ?, 1, 0)`
  );

  for (const ex of RECOMMENDED_EXERCISES) {
    const existing = findByName.get(ex.name);
    if (existing) {
      updateEx.run(
        ex.muscle_group,
        ex.equipment,
        ex.movement_type,
        ex.instructions,
        ex.youtube_id,
        existing.id
      );
    } else {
      insertEx.run(
        ex.name,
        ex.muscle_group,
        ex.equipment,
        ex.movement_type,
        ex.instructions,
        ex.youtube_id
      );
    }
  }
}

function getDb() {
  if (!dbInstance) {
    ensureInitialized();
    dbInstance = new DatabaseSync(DB_PATH);
    dbInstance.exec('PRAGMA journal_mode = WAL;');
    dbInstance.exec('PRAGMA foreign_keys = ON;');
    runMigrations(dbInstance);
  }
  return dbInstance;
}

function queryAll(sql, params = []) {
  const stmt = getDb().prepare(sql);
  return stmt.all(...params);
}

function queryOne(sql, params = []) {
  const stmt = getDb().prepare(sql);
  return stmt.get(...params) || null;
}

function execute(sql, params = []) {
  const stmt = getDb().prepare(sql);
  return stmt.run(...params);
}

function transaction(fn) {
  const db = getDb();
  db.exec('BEGIN');
  try {
    const result = fn(db);
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = {
  DB_PATH,
  getDb,
  queryAll,
  queryOne,
  execute,
  transaction,
};
