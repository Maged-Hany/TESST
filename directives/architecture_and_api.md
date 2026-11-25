# Directive: Foody Architecture & REST API Specification

## Goal
Provide a complete, deterministic backend and database layer for **Foody** — an English-language nutrition tracker, weekly meal planner, workout schedule builder, and fitness progress platform.

> **Important Note for Frontend Development (Claude Handoff)**:
> - The backend is completely built, seeded, and verified.
> - **No frontend files (`src/`, `index.html`, `.css`, or Vite config) have been created yet** by request of the user, so the frontend model has complete creative freedom to design and build the React (Vite) UI from scratch.
> - `react`, `react-dom`, `lucide-react`, `vite`, and `@vitejs/plugin-react` are already pre-installed in `node_modules/`.
> - On Windows PowerShell in this environment, `npm.ps1` is blocked by execution policy; always invoke `npm.cmd` instead of `npm` (e.g., `npm.cmd run server`, `npm.cmd run dev`).
> - All user-facing copy and interface elements MUST be in **English only** (`LTR`).

---

## Frontend Status & Design System

- **Built so far**:
  - **Home (`#home`)**: Dark cinematic hero (`src/components/Hero.jsx`) with centered muscular athlete cutout, softly feathered top-left spotlight beam, boxed top navbar (`src/components/Navbar.jsx`) with links `Home`, `Workouts`, `Meal Plan`, `MyCalories` (no logo, no red underline on active link). Never uses skeleton loading or rain animation.
  - **MyCalories (`#my-calories`)**: Modular page (`src/pages/MyCalories.jsx`) split into `WeekStrip`, `BudgetPanel`, `MealComposer`, `MealLog`, `ProfileDialog`, and `Segmented` (`src/components/calories/*`) with styles in `src/styles/my-calories.css` and helpers in `src/lib/*`.
  - **Workouts (`#workouts`)**: Full interactive page (`src/pages/Workouts.jsx`) with Training Split Method switcher (`PPL`, `Upper/Lower`, `Arnold`, `Bro Split`, `Full Body`, `Custom Manual`), 7-day strip, 6 recommended popular workouts per muscle group (42 total in `server/utils/workoutCatalog.js`), embedded YouTube form tutorial player, manual day/exercise customization, set logging, and 1-click workout-day streak logging.
  - **Meal Plan (`#meal-plan`)**: Full weekly meal planner (`src/pages/MealPlan.jsx`) with 7-day planned calorie strip, 44px segmented day bar, full-word macro meters, `Saved foods` + `Custom meal` composer, per-meal `Log today`, and `Log entire day plan to My Calories`.
  - **Account & Streak System (`#account`)**: Registration & sign-in (`src/pages/Account.jsx`, `server/routes/auth.js`, `server/middleware/auth.js`), small side athlete streak badge (`src/components/StreakWidget.jsx`) that upgrades to crimson when `current_streak > 10`, and the `"You got a streak"` popup (`src/components/StreakPopup.jsx`).
  - **Input Validation & On-Demand Meal Photos**: Shared validation helpers in `server/utils/validate.js` return clean `400` responses; meal photos are streamed on demand via `GET /api/food-logs/:id/image` (never inlined in list responses), and 7-day calorie totals are served via `GET /api/food-logs/summary`.
- **Custom AI Provider Hook**: Configure `FOODY_AI_API_URL`, `FOODY_AI_API_KEY`, and `FOODY_AI_MODEL` in `.env` for `server/routes/ai.js` (`POST /api/ai/analyze-meal`). Until configured, a deterministic catalog-aware fallback estimator powers the full end-to-end flow.
- **Palette** is sampled from the hero athlete image (defined as CSS vars in `src/styles/global.css`): iron `#0e161d`, graphite `#17222b`, stone-mid `#56534f`, slate `#9e9b93`, chalk `#e6e5e0`, sash red `#a83226`.
- **Type**: Newsreader (display serif), Hanken Grotesk (UI/body).
- **Run**: `npm.cmd start` runs API (3001) + Vite (5173, proxies `/api`).

---

## System Architecture

1. **Database**: SQLite (`server/data/foody.sqlite`) accessed via Node.js v24 built-in `node:sqlite` (`DatabaseSync`) and Python's built-in `sqlite3`.
2. **Execution Layer (`execution/`)**:
   - `execution/init_db.py` — Initializes schema and seeds rich English sample data (`--reset` drops and recreates all tables).
   - `execution/calculate_targets.py` — Deterministic CLI and library for BMR, TDEE, macro splits, hydration targets, and 1RM calculations.
   - `execution/test_api.py` — End-to-end automated integration test suite covering all REST API endpoints.
3. **API Server (`server/`)**:
   - Runs on `http://localhost:3001` (configurable via `PORT` in `.env`).
   - Base API URL: `http://localhost:3001/api`.
   - Supports `?date=YYYY-MM-DD` (defaults to today's local date in `YYYY-MM-DD` format if omitted).

---

## Database Schema Summary

- **`user_profile`**: Single-user profile & targets (`id`, `name`, `age`, `gender`, `height_cm`, `weight_kg`, `target_weight_kg`, `activity_level`, `goal`, `diet_preference`, `daily_calorie_target`, `daily_protein_g`, `daily_carbs_g`, `daily_fat_g`, `daily_fiber_g`, `daily_water_ml`, `updated_at`)
- **`foods`**: Master & custom food items (`id`, `name`, `category`, `serving_size`, `serving_unit`, `calories`, `protein_g`, `carbs_g`, `fat_g`, `fiber_g`, `is_favorite`, `is_custom`, `created_at`)
- **`food_logs`**: Daily logged meals (`id`, `date`, `meal_type`, `food_id`, `food_name`, `servings`, `serving_size`, `serving_unit`, `calories`, `protein_g`, `carbs_g`, `fat_g`, `fiber_g`, `notes`, `logged_at`)
- **`meal_plans`**: Weekly meal planner entries (`id`, `day_of_week`, `meal_type`, `food_id`, `meal_name`, `servings`, `serving_unit`, `calories`, `protein_g`, `carbs_g`, `fat_g`, `prep_notes`, `is_completed`, `order_index`)
- **`exercises`**: Exercise library (`id`, `name`, `muscle_group`, `equipment`, `movement_type`, `instructions`, `is_custom`)
- **`workout_plans`**: 7-day workout schedule (`id`, `day_of_week`, `title`, `focus_area`, `estimated_duration_min`, `is_rest_day`, `notes`)
- **`workout_plan_exercises`**: Planned exercises for each scheduled day (`id`, `workout_plan_id`, `exercise_id`, `order_index`, `target_sets`, `target_reps`, `target_weight_kg`, `rest_seconds`, `notes`)
- **`workout_logs`**: Completed workout sessions (`id`, `date`, `workout_plan_id`, `title`, `focus_area`, `duration_min`, `calories_burned`, `notes`, `created_at`)
- **`workout_log_sets`**: Individual logged sets within a workout session (`id`, `workout_log_id`, `exercise_id`, `exercise_name`, `set_number`, `reps`, `weight_kg`, `rpe`, `is_warmup`, `is_pr`, `estimated_1rm`)
- **`water_logs`**: Daily hydration entries (`id`, `date`, `amount_ml`, `note`, `logged_at`)
- **`weight_logs`**: Daily body weight & body fat check-ins (`id`, `date`, `weight_kg`, `body_fat_pct`, `notes`, `created_at`)

---

## Complete REST API Reference

### 1. Health & Unified Dashboard

#### `GET /api/health`
Returns server status and database connectivity.

#### `GET /api/dashboard?date=YYYY-MM-DD`
Returns everything needed for the main Overview/Dashboard view in a single call:
```json
{
  "date": "2026-11-21",
  "day_of_week": "saturday",
  "profile": { ... },
  "nutrition": {
    "consumed": { "calories": 1820, "protein_g": 158.5, "carbs_g": 172.0, "fat_g": 54.0, "fiber_g": 26.5 },
    "targets": { "calories": 2250, "protein_g": 180, "carbs_g": 225, "fat_g": 70, "fiber_g": 30 },
    "remaining": { "calories": 430, "protein_g": 21.5, "carbs_g": 53.0, "fat_g": 16.0, "fiber_g": 3.5 },
    "percentages": { "calories": 81, "protein_g": 88, "carbs_g": 76, "fat_g": 77, "fiber_g": 88 },
    "meals": { "breakfast": [...], "lunch": [...], "dinner": [...], "snack": [...] },
    "total_items": 6
  },
  "hydration": {
    "consumed_ml": 2250,
    "target_ml": 3000,
    "remaining_ml": 750,
    "percentage": 75,
    "entries": [...]
  },
  "today_meal_plan": {
    "day_of_week": "saturday",
    "items": [...],
    "totals": { "calories": 2190, "protein_g": 178, "carbs_g": 215, "fat_g": 67 }
  },
  "today_workout_plan": {
    "id": 6,
    "day_of_week": "saturday",
    "title": "Lower Body Strength & Conditioning",
    "focus_area": "Legs & Core",
    "estimated_duration_min": 65,
    "is_rest_day": 0,
    "exercises": [...]
  },
  "today_workout_logs": [...],
  "weight": {
    "current_kg": 78.5,
    "start_kg": 80.2,
    "target_kg": 75.0,
    "change_kg": -1.7,
    "to_goal_kg": 3.5,
    "latest_log": { ... }
  }
}
```

#### `GET /api/analytics?days=14`
Returns time-series datasets for charts and progress visualizations:
- `nutrition_series`: Daily calories, protein, carbs, fat, fiber vs targets over the last `days` days + average adherence.
- `hydration_series`: Daily water intake (`amount_ml` vs `target_ml`).
- `weight_series`: Daily weight check-ins with 7-day rolling average (`rolling_avg_kg`) and body fat %.
- `workout_summary`: Total sessions, total sets, total volume (`kg`), total duration (`min`), calories burned, personal records (`pr_count`), daily volume series, and muscle group set distribution.

---

### 2. User Profile & TDEE / Macro Calculator

#### `GET /api/profile`
Returns the user profile plus live calculated `bmr` and `tdee` metrics.

#### `PUT /api/profile`
Updates profile fields. If `recalculate_targets: true` is passed in the body, automatically recalculates and saves `daily_calorie_target`, `daily_protein_g`, `daily_carbs_g`, `daily_fat_g`, `daily_fiber_g`, and `daily_water_ml`.

#### `POST /api/calculator/tdee`
Calculates BMR, TDEE, recommended daily calories, macro grams, and hydration without mutating the database (unless `apply_to_profile: true` is passed).
- **Body**: `{ "age": 27, "gender": "male", "height_cm": 178, "weight_kg": 78.5, "activity_level": "moderate", "goal": "cut", "diet_preference": "high_protein", "apply_to_profile": false }`

#### `POST /api/calculator/1rm`
Calculates estimated One-Rep Max (Epley formula) and percentage load table (`95%`, `90%`, `85%`, `80%`, `75%`, `70%`).
- **Body**: `{ "weight_kg": 100, "reps": 5 }`

---

### 3. Food Catalog & Favorites (`/api/foods`)

- `GET /api/foods?q=&category=&favorites_only=false` — List/search foods. Also returns distinct `categories`.
- `GET /api/foods/:id` — Get single food item.
- `POST /api/foods` — Create custom food (`name`, `category`, `serving_size`, `serving_unit`, `calories`, `protein_g`, `carbs_g`, `fat_g`, `fiber_g`, `is_favorite`).
- `PUT /api/foods/:id` — Update food item.
- `PATCH /api/foods/:id/favorite` — Toggle `is_favorite` boolean (or set explicit `{ "is_favorite": true }`).
- `DELETE /api/foods/:id` — Delete food item.

---

### 4. Daily Food Logs (`/api/food-logs`)

- `GET /api/food-logs?date=YYYY-MM-DD` — Returns all logged food items for the date, grouped by `meals` (`breakfast`, `lunch`, `dinner`, `snack`), plus `totals`, `targets`, `remaining`, and `percentages`.
- `POST /api/food-logs` — Log a food item.
  - Option A (from catalog): `{ "date": "2026-11-21", "meal_type": "breakfast", "food_id": 1, "servings": 1.5, "notes": "Post-workout" }` (automatically multiplies catalog macros by `servings`).
  - Option B (custom/quick entry): `{ "date": "2026-11-21", "meal_type": "lunch", "food_name": "Homemade Chicken Wrap", "servings": 1, "serving_size": 1, "serving_unit": "wrap", "calories": 520, "protein_g": 42, "carbs_g": 48, "fat_g": 16, "fiber_g": 6 }`
- `PUT /api/food-logs/:id` — Update `servings` (auto-recalculates macros if linked to `food_id` unless explicit macros are passed), `meal_type`, `notes`, or macros.
- `DELETE /api/food-logs/:id` — Remove logged item.

---

### 5. Weekly Meal Planner (`/api/meal-plans`)

- `GET /api/meal-plans?day_of_week=` — Returns the 7-day weekly meal plan (`monday`..`sunday`) with items grouped by day and meal type, plus per-day calorie and macro totals vs user targets.
- `POST /api/meal-plans` — Add a planned meal to a day of the week (`day_of_week`, `meal_type`, `food_id` or `meal_name`, `servings`, `serving_unit`, `calories`, `protein_g`, `carbs_g`, `fat_g`, `prep_notes`).
- `PUT /api/meal-plans/:id` — Update a planned meal (including toggling `is_completed`).
- `POST /api/meal-plans/:id/log` — One-click log a planned meal directly into `food_logs` for a given `date` (defaults to today) and marks the planned meal `is_completed = 1`.
- `POST /api/meal-plans/day/:dayOfWeek/log-all` — Log all planned meals for `:dayOfWeek` into `food_logs` for `date`.
- `DELETE /api/meal-plans/:id` — Delete a planned meal.

---

### 6. Exercise Library, Workout Schedule & Workout Session Tracker

#### Exercise Library (`/api/exercises`)
- `GET /api/exercises?q=&muscle_group=&equipment=` — List exercises + available `muscle_groups` and `equipment_types`.
- `POST /api/exercises` — Create custom exercise (`name`, `muscle_group`, `equipment`, `movement_type`, `instructions`).
- `GET /api/exercises/:id/history` — Returns historical progression for an exercise across workout logs (date, max weight, best estimated 1RM, total volume, total sets, and individual sets).

#### Weekly Workout Schedule (`/api/workout-plans`)
- `GET /api/workout-plans` — Returns all 7 days (`monday`..`sunday`) of the workout schedule, each with its nested `exercises` array (joined with exercise details).
- `GET /api/workout-plans/:id` — Single workout day plan with nested exercises.
- `POST /api/workout-plans` — Create or update a day's workout plan (supports passing `exercises: [...]` array to replace/set the day's planned exercises in one transaction).
- `PUT /api/workout-plans/:id` — Update day title, focus_area, estimated_duration_min, is_rest_day, notes, and optionally `exercises`.
- `POST /api/workout-plans/:id/exercises` — Add a planned exercise to a day (`exercise_id`, `target_sets`, `target_reps`, `target_weight_kg`, `rest_seconds`, `notes`).
- `PUT /api/workout-plans/:planId/exercises/:itemId` — Update planned sets/reps/weight/rest/order.
- `DELETE /api/workout-plans/:planId/exercises/:itemId` — Remove planned exercise from day.

#### Workout Sessions & Set Tracker (`/api/workout-logs`)
- `GET /api/workout-logs?date=&from=&to=&limit=20` — List logged workout sessions with nested `sets`, computed `total_volume_kg`, `total_sets`, `unique_exercises`, and `pr_count`.
- `GET /api/workout-logs/:id` — Get full workout session details and sets.
- `POST /api/workout-logs` — Log a workout session.
  - Can be created with an explicit `sets` array (`[{ "exercise_id": 1, "set_number": 1, "reps": 8, "weight_kg": 80, "rpe": 8, "is_warmup": false }]`)
  - Or pass `from_workout_plan_id` to auto-populate default sets from a scheduled workout routine!
  - Automatically computes `estimated_1rm` for every set and flags `is_pr = 1` when a set's estimated 1RM exceeds historical bests for that exercise.
- `PUT /api/workout-logs/:id` — Update workout session metadata and/or replace `sets`.
- `DELETE /api/workout-logs/:id` — Delete workout session and its sets.

---

### 7. Hydration & Body Weight Tracking

#### Water Logs (`/api/water-logs`)
- `GET /api/water-logs?date=YYYY-MM-DD` — Returns water intake entries for the date plus `consumed_ml`, `target_ml`, `remaining_ml`, and `percentage`.
- `POST /api/water-logs` — Log water intake (`{ "date": "2026-11-21", "amount_ml": 250, "note": "Morning glass" }`).
- `DELETE /api/water-logs/:id` — Delete water intake entry.

#### Body Weight Logs (`/api/weight-logs`)
- `GET /api/weight-logs?days=30` — Returns weight history sorted chronologically with 7-day rolling average, plus summary stats (`current_kg`, `start_kg`, `target_kg`, `change_kg`, `to_goal_kg`, `min_kg`, `max_kg`).
- `POST /api/weight-logs` — Upsert weight entry for `date` (`{ "date": "2026-11-21", "weight_kg": 78.3, "body_fat_pct": 15.6, "notes": "Morning weigh-in" }`). Automatically syncs `user_profile.weight_kg` if the entry is the latest date.
- `DELETE /api/weight-logs/:id` — Delete weight entry.
