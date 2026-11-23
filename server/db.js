const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

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
    const initScript = path.resolve(ROOT_DIR, 'execution', 'init_db.py');
    execFileSync('python', [initScript, '--db-path', DB_PATH], {
      stdio: 'inherit',
    });
  }
}

function runMigrations(db) {
  const profileCols = db.prepare('PRAGMA table_info(user_profile)').all().map((c) => c.name);
  if (!profileCols.includes('health_notes')) {
    db.exec("ALTER TABLE user_profile ADD COLUMN health_notes TEXT NOT NULL DEFAULT ''");
  }
  if (!profileCols.includes('profile_completed')) {
    db.exec('ALTER TABLE user_profile ADD COLUMN profile_completed INTEGER NOT NULL DEFAULT 0');
  }

  const foodLogCols = db.prepare('PRAGMA table_info(food_logs)').all().map((c) => c.name);
  if (!foodLogCols.includes('image_data')) {
    db.exec("ALTER TABLE food_logs ADD COLUMN image_data TEXT DEFAULT ''");
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
