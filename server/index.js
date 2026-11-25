require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { getDb, DB_PATH, queryOne } = require('./db');
const { attachAuth } = require('./middleware/auth');

const { router: authRouter } = require('./routes/auth');
const { router: profileRouter } = require('./routes/profile');
const { router: foodsRouter } = require('./routes/foods');
const { router: mealPlansRouter } = require('./routes/mealPlans');
const { router: workoutsRouter } = require('./routes/workouts');
const { router: trackingRouter } = require('./routes/tracking');
const { router: aiRouter } = require('./routes/ai');

const app = express();
const PORT = Number(process.env.PORT || 3001);

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(attachAuth);

// Initialize SQLite connection & auto-seed/migrate on startup
getDb();

// Health check endpoint
app.get('/api/health', (req, res) => {
  const foodCount = queryOne('SELECT COUNT(*) AS count FROM foods');
  const exerciseCount = queryOne('SELECT COUNT(*) AS count FROM exercises');
  res.json({
    status: 'ok',
    service: 'Foody API Server',
    database: DB_PATH,
    counts: {
      foods: foodCount?.count || 0,
      exercises: exerciseCount?.count || 0,
    },
    timestamp: new Date().toISOString(),
  });
});

// Mount API route modules
app.use('/api', authRouter);
app.use('/api', profileRouter);
app.use('/api', foodsRouter);
app.use('/api', mealPlansRouter);
app.use('/api', workoutsRouter);
app.use('/api', trackingRouter);
app.use('/api', aiRouter);

// 404 handler for unknown API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: `API endpoint not found: ${req.method} ${req.originalUrl}`,
  });
});

// Global error handler (log stack traces only for unexpected 5xx server errors)
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) {
    console.error('[Foody API Error]:', err);
  }
  res.status(status).json({
    error: err.message || 'Internal Server Error',
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[Foody Server] Running on http://localhost:${PORT}`);
    console.log(`[Foody Server] SQLite Database: ${DB_PATH}`);
  });
}

module.exports = app;
