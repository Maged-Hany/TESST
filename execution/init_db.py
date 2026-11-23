#!/usr/bin/env python3
"""
Deterministic Database Initializer & Seeder for Foody.
Creates SQLite tables in server/data/foody.sqlite and seeds comprehensive
English-language sample data for foods, exercises, user profile, daily food logs,
weekly meal plans, 7-day workout schedule, logged workout sessions, hydration,
and 14-day weight history.
"""

import argparse
from datetime import date, timedelta
import os
from pathlib import Path
import sqlite3
import sys

# Ensure we can import calculate_targets from the same directory
sys.path.insert(0, str(Path(__file__).resolve().parent))
from calculate_targets import calculate_1rm, calculate_nutrition_targets

ROOT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = ROOT_DIR / "server" / "data" / "foody.sqlite"


SCHEMA_SQL = """
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL DEFAULT 'Alex Rivera',
    age INTEGER NOT NULL DEFAULT 27,
    gender TEXT NOT NULL DEFAULT 'male',
    height_cm REAL NOT NULL DEFAULT 178.0,
    weight_kg REAL NOT NULL DEFAULT 78.5,
    target_weight_kg REAL NOT NULL DEFAULT 75.0,
    activity_level TEXT NOT NULL DEFAULT 'moderate',
    goal TEXT NOT NULL DEFAULT 'cut',
    diet_preference TEXT NOT NULL DEFAULT 'high_protein',
    daily_calorie_target INTEGER NOT NULL DEFAULT 2321,
    daily_protein_g INTEGER NOT NULL DEFAULT 203,
    daily_carbs_g INTEGER NOT NULL DEFAULT 232,
    daily_fat_g INTEGER NOT NULL DEFAULT 64,
    daily_fiber_g INTEGER NOT NULL DEFAULT 32,
    daily_water_ml INTEGER NOT NULL DEFAULT 3250,
    health_notes TEXT NOT NULL DEFAULT '',
    profile_completed INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS foods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    serving_size REAL NOT NULL DEFAULT 100,
    serving_unit TEXT NOT NULL DEFAULT 'g',
    calories INTEGER NOT NULL,
    protein_g REAL NOT NULL DEFAULT 0,
    carbs_g REAL NOT NULL DEFAULT 0,
    fat_g REAL NOT NULL DEFAULT 0,
    fiber_g REAL NOT NULL DEFAULT 0,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    is_custom INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS food_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
    food_id INTEGER REFERENCES foods(id) ON DELETE SET NULL,
    food_name TEXT NOT NULL,
    servings REAL NOT NULL DEFAULT 1.0,
    serving_size REAL NOT NULL DEFAULT 100,
    serving_unit TEXT NOT NULL DEFAULT 'g',
    calories INTEGER NOT NULL,
    protein_g REAL NOT NULL DEFAULT 0,
    carbs_g REAL NOT NULL DEFAULT 0,
    fat_g REAL NOT NULL DEFAULT 0,
    fiber_g REAL NOT NULL DEFAULT 0,
    notes TEXT DEFAULT '',
    image_data TEXT DEFAULT '',
    logged_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_food_logs_date ON food_logs(date);

CREATE TABLE IF NOT EXISTS meal_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day_of_week TEXT NOT NULL CHECK (day_of_week IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
    meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
    food_id INTEGER REFERENCES foods(id) ON DELETE SET NULL,
    meal_name TEXT NOT NULL,
    servings REAL NOT NULL DEFAULT 1.0,
    serving_unit TEXT NOT NULL DEFAULT 'serving',
    calories INTEGER NOT NULL,
    protein_g REAL NOT NULL DEFAULT 0,
    carbs_g REAL NOT NULL DEFAULT 0,
    fat_g REAL NOT NULL DEFAULT 0,
    prep_notes TEXT DEFAULT '',
    is_completed INTEGER NOT NULL DEFAULT 0,
    order_index INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_meal_plans_day ON meal_plans(day_of_week);

CREATE TABLE IF NOT EXISTS exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    muscle_group TEXT NOT NULL,
    equipment TEXT NOT NULL,
    movement_type TEXT NOT NULL DEFAULT 'Compound',
    instructions TEXT DEFAULT '',
    is_custom INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS workout_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day_of_week TEXT NOT NULL UNIQUE CHECK (day_of_week IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
    title TEXT NOT NULL,
    focus_area TEXT NOT NULL,
    estimated_duration_min INTEGER NOT NULL DEFAULT 60,
    is_rest_day INTEGER NOT NULL DEFAULT 0,
    notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS workout_plan_exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workout_plan_id INTEGER NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
    exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL DEFAULT 0,
    target_sets INTEGER NOT NULL DEFAULT 3,
    target_reps TEXT NOT NULL DEFAULT '8-10',
    target_weight_kg REAL NOT NULL DEFAULT 0,
    rest_seconds INTEGER NOT NULL DEFAULT 90,
    notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS workout_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    workout_plan_id INTEGER REFERENCES workout_plans(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    focus_area TEXT NOT NULL DEFAULT '',
    duration_min INTEGER NOT NULL DEFAULT 60,
    calories_burned INTEGER NOT NULL DEFAULT 350,
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_workout_logs_date ON workout_logs(date);

CREATE TABLE IF NOT EXISTS workout_log_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workout_log_id INTEGER NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
    exercise_id INTEGER REFERENCES exercises(id) ON DELETE SET NULL,
    exercise_name TEXT NOT NULL,
    set_number INTEGER NOT NULL,
    reps INTEGER NOT NULL,
    weight_kg REAL NOT NULL DEFAULT 0,
    rpe REAL DEFAULT 8.0,
    is_warmup INTEGER NOT NULL DEFAULT 0,
    is_pr INTEGER NOT NULL DEFAULT 0,
    estimated_1rm REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS water_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    amount_ml INTEGER NOT NULL,
    note TEXT DEFAULT '',
    logged_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_water_logs_date ON water_logs(date);

CREATE TABLE IF NOT EXISTS weight_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,
    weight_kg REAL NOT NULL,
    body_fat_pct REAL,
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_weight_logs_date ON weight_logs(date);
"""


def seed_database(conn: sqlite3.Connection):
    cur = conn.cursor()

    # 1. Seed User Profile
    targets = calculate_nutrition_targets(
        weight_kg=78.5,
        height_cm=178.0,
        age=27,
        gender="male",
        activity_level="moderate",
        goal="cut",
        diet_preference="high_protein",
    )

    cur.execute(
        """
        INSERT OR REPLACE INTO user_profile (
            id, name, age, gender, height_cm, weight_kg, target_weight_kg,
            activity_level, goal, diet_preference,
            daily_calorie_target, daily_protein_g, daily_carbs_g, daily_fat_g,
            daily_fiber_g, daily_water_ml
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "Alex Rivera",
            27,
            "male",
            178.0,
            78.5,
            75.0,
            "moderate",
            "cut",
            "high_protein",
            targets["daily_calorie_target"],
            targets["daily_protein_g"],
            targets["daily_carbs_g"],
            targets["daily_fat_g"],
            targets["daily_fiber_g"],
            targets["daily_water_ml"],
        ),
    )

    # 2. Seed Foods Catalog (32 items across 8 categories)
    foods_data = [
        # (name, category, serving_size, serving_unit, calories, protein_g, carbs_g, fat_g, fiber_g, is_favorite)
        ("Grilled Chicken Breast", "Protein", 150, "g", 248, 46.5, 0.0, 5.4, 0.0, 1),
        ("Atlantic Salmon Fillet", "Protein", 150, "g", 312, 33.0, 0.0, 19.5, 0.0, 1),
        ("Lean Ground Beef (93/7)", "Protein", 150, "g", 228, 31.5, 0.0, 10.5, 0.0, 0),
        ("Tuna Steak (Seared)", "Protein", 150, "g", 198, 43.5, 0.0, 2.0, 0.0, 0),
        ("Extra Firm Tofu", "Protein", 150, "g", 144, 15.0, 3.0, 8.0, 1.5, 0),
        ("Whey Protein Isolate Shake", "Protein", 1, "scoop (32g)", 125, 27.0, 2.0, 1.0, 0.0, 1),
        ("Whole Large Eggs", "Dairy & Eggs", 2, "eggs (100g)", 143, 12.6, 0.7, 9.5, 0.0, 1),
        ("Liquid Egg Whites", "Dairy & Eggs", 150, "ml", 78, 16.5, 1.1, 0.2, 0.0, 0),
        ("Greek Yogurt (0% Fat Plain)", "Dairy & Eggs", 200, "g", 118, 20.6, 7.2, 0.4, 0.0, 1),
        ("Low-Fat Cottage Cheese", "Dairy & Eggs", 150, "g", 122, 18.0, 5.1, 2.7, 0.0, 0),
        ("Rolled Oats (Dry)", "Grains & Starches", 60, "g", 233, 8.0, 40.6, 3.9, 6.2, 1),
        ("Cooked Jasmine Rice", "Grains & Starches", 180, "g", 234, 4.9, 50.4, 0.5, 0.7, 1),
        ("Cooked Quinoa", "Grains & Starches", 185, "g", 222, 8.1, 39.4, 3.6, 5.2, 0),
        ("Baked Sweet Potato", "Grains & Starches", 200, "g", 180, 4.0, 41.4, 0.3, 6.6, 1),
        ("Sourdough Bread Slice", "Grains & Starches", 1, "slice (55g)", 150, 6.0, 29.0, 1.0, 1.5, 0),
        ("Whole Wheat Pasta (Cooked)", "Grains & Starches", 180, "g", 223, 9.5, 47.7, 1.4, 6.3, 0),
        ("Fresh Blueberries", "Fruits", 100, "g", 57, 0.7, 14.5, 0.3, 2.4, 1),
        ("Medium Banana", "Fruits", 1, "banana (118g)", 105, 1.3, 27.0, 0.4, 3.1, 1),
        ("Honeycrisp Apple", "Fruits", 1, "apple (180g)", 95, 0.5, 25.1, 0.3, 4.4, 0),
        ("Strawberries", "Fruits", 150, "g", 48, 1.0, 11.5, 0.5, 3.0, 0),
        ("Steamed Broccoli Florets", "Vegetables", 150, "g", 52, 3.6, 10.8, 0.6, 5.0, 1),
        ("Baby Spinach (Raw)", "Vegetables", 100, "g", 23, 2.9, 3.6, 0.4, 2.2, 0),
        ("Roasted Asparagus", "Vegetables", 150, "g", 33, 3.6, 6.2, 0.3, 3.0, 0),
        ("Mixed Bell Peppers & Zucchini", "Vegetables", 150, "g", 42, 1.6, 8.8, 0.4, 2.6, 0),
        ("Hass Avocado", "Nuts & Healthy Fats", 75, "g (half)", 120, 1.5, 6.4, 11.0, 5.0, 1),
        ("Natural Almond Butter", "Nuts & Healthy Fats", 1, "tbsp (16g)", 98, 3.4, 3.0, 8.9, 1.6, 1),
        ("Raw Walnuts & Almonds Mix", "Nuts & Healthy Fats", 30, "g", 185, 5.2, 4.8, 16.5, 2.8, 0),
        ("Extra Virgin Olive Oil", "Nuts & Healthy Fats", 1, "tbsp (14g)", 119, 0.0, 0.0, 13.5, 0.0, 0),
        ("Rice Cakes with Sea Salt", "Snacks & Drinks", 2, "cakes (18g)", 70, 1.4, 15.0, 0.5, 0.6, 0),
        ("Dark Chocolate (85% Cacao)", "Snacks & Drinks", 25, "g", 150, 2.2, 8.5, 12.5, 2.8, 0),
        ("Chicken Power Bowl (Quinoa, Greens, Avocado)", "Prepared Meals", 1, "bowl (420g)", 565, 48.0, 52.0, 18.5, 8.5, 1),
        ("Mediterranean Salmon & Brown Rice Plate", "Prepared Meals", 1, "plate (450g)", 620, 41.0, 56.0, 24.0, 6.5, 1),
    ]

    cur.executemany(
        """
        INSERT INTO foods (
            name, category, serving_size, serving_unit,
            calories, protein_g, carbs_g, fat_g, fiber_g, is_favorite, is_custom
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        """,
        foods_data,
    )

    # Map food names to IDs and details
    cur.execute("SELECT id, name, serving_size, serving_unit, calories, protein_g, carbs_g, fat_g, fiber_g FROM foods")
    food_map = {row[1]: row for row in cur.fetchall()}

    # 3. Seed Daily Food Logs for past 7 days + today
    today = date.today()
    daily_templates = [
        # Day offset 0 (Today) - well tracked day
        [
            ("breakfast", "Rolled Oats (Dry)", 1.0, "Cooked with cinnamon"),
            ("breakfast", "Whole Large Eggs", 1.5, "3 scrambled eggs"),
            ("breakfast", "Fresh Blueberries", 1.0, "Topping on oats"),
            ("lunch", "Chicken Power Bowl (Quinoa, Greens, Avocado)", 1.0, "Post-morning session lunch"),
            ("snack", "Greek Yogurt (0% Fat Plain)", 1.0, "Afternoon protein snack"),
            ("snack", "Medium Banana", 1.0, "Pre-workout carbs"),
            ("dinner", "Atlantic Salmon Fillet", 1.0, "Oven baked with lemon"),
            ("dinner", "Baked Sweet Potato", 1.0, "With sea salt"),
            ("dinner", "Steamed Broccoli Florets", 1.0, "Side greens"),
        ],
        # Day offset -1 (Yesterday)
        [
            ("breakfast", "Greek Yogurt (0% Fat Plain)", 1.25, "Morning yogurt bowl"),
            ("breakfast", "Rolled Oats (Dry)", 1.0, "Overnight oats"),
            ("breakfast", "Natural Almond Butter", 1.0, "Swirled in oats"),
            ("lunch", "Grilled Chicken Breast", 1.2, "Meal prep box"),
            ("lunch", "Cooked Jasmine Rice", 1.2, "Steamed"),
            ("lunch", "Steamed Broccoli Florets", 1.0, ""),
            ("snack", "Whey Protein Isolate Shake", 1.0, "Post-workout shake"),
            ("snack", "Honeycrisp Apple", 1.0, ""),
            ("dinner", "Lean Ground Beef (93/7)", 1.2, "Seasoned beef bowl"),
            ("dinner", "Baked Sweet Potato", 1.0, ""),
            ("dinner", "Hass Avocado", 1.0, "Sliced"),
        ],
        # Day offset -2
        [
            ("breakfast", "Whole Large Eggs", 1.5, "Omelette"),
            ("breakfast", "Liquid Egg Whites", 1.0, "Added protein"),
            ("breakfast", "Sourdough Bread Slice", 2.0, "Toasted"),
            ("lunch", "Mediterranean Salmon & Brown Rice Plate", 1.0, ""),
            ("snack", "Whey Protein Isolate Shake", 1.0, ""),
            ("snack", "Raw Walnuts & Almonds Mix", 1.0, ""),
            ("dinner", "Grilled Chicken Breast", 1.2, ""),
            ("dinner", "Whole Wheat Pasta (Cooked)", 1.2, "With garlic & herbs"),
            ("dinner", "Roasted Asparagus", 1.0, ""),
        ],
    ]

    for days_ago in range(7, -1, -1):
        log_date = (today - timedelta(days=days_ago)).isoformat()
        template = daily_templates[days_ago % len(daily_templates)]
        for meal_type, food_name, servings, notes in template:
            f_row = food_map[food_name]
            f_id, _, s_size, s_unit, cal, prot, carb, fat, fib = f_row
            cur.execute(
                """
                INSERT INTO food_logs (
                    date, meal_type, food_id, food_name, servings, serving_size, serving_unit,
                    calories, protein_g, carbs_g, fat_g, fiber_g, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    log_date,
                    meal_type,
                    f_id,
                    food_name,
                    servings,
                    s_size,
                    s_unit,
                    round(cal * servings),
                    round(prot * servings, 1),
                    round(carb * servings, 1),
                    round(fat * servings, 1),
                    round(fib * servings, 1),
                    notes,
                ),
            )

    # 4. Seed 7-Day Weekly Meal Plan
    days_of_week = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    weekly_plan_templates = {
        "monday": [
            ("breakfast", "Rolled Oats (Dry)", 1.0, "Mix with 1 scoop whey & berries", 415, 35.7, 57.1, 5.2),
            ("lunch", "Chicken Power Bowl (Quinoa, Greens, Avocado)", 1.0, "Prepped Sunday night", 565, 48.0, 52.0, 18.5),
            ("snack", "Greek Yogurt (0% Fat Plain)", 1.0, "Top with 1 tbsp almond butter", 216, 24.0, 10.2, 9.3),
            ("dinner", "Atlantic Salmon Fillet", 1.0, "With 200g sweet potato & broccoli", 544, 40.6, 52.2, 20.4),
        ],
        "tuesday": [
            ("breakfast", "Whole Large Eggs", 1.5, "3 eggs + 2 slices sourdough toast", 515, 30.9, 59.1, 16.3),
            ("lunch", "Grilled Chicken Breast", 1.2, "With 180g jasmine rice & veggies", 574, 62.3, 59.2, 7.4),
            ("snack", "Whey Protein Isolate Shake", 1.0, "With 1 medium banana pre-gym", 230, 28.3, 29.0, 1.4),
            ("dinner", "Lean Ground Beef (93/7)", 1.2, "Taco bowl with quinoa & half avocado", 616, 47.4, 45.8, 27.2),
        ],
        "wednesday": [
            ("breakfast", "Greek Yogurt (0% Fat Plain)", 1.5, "With 60g rolled oats & blueberries", 467, 39.6, 65.9, 4.8),
            ("lunch", "Mediterranean Salmon & Brown Rice Plate", 1.0, "Packaged meal prep", 620, 41.0, 56.0, 24.0),
            ("snack", "Low-Fat Cottage Cheese", 1.0, "With honeycrisp apple slices", 217, 18.5, 30.2, 3.0),
            ("dinner", "Grilled Chicken Breast", 1.2, "With cooked whole wheat pasta & asparagus", 554, 68.9, 53.9, 8.2),
        ],
        "thursday": [
            ("breakfast", "Rolled Oats (Dry)", 1.0, "Protein oatmeal + banana", 463, 36.3, 69.6, 5.3),
            ("lunch", "Chicken Power Bowl (Quinoa, Greens, Avocado)", 1.0, "Fresh greens & lemon dressing", 565, 48.0, 52.0, 18.5),
            ("snack", "Whey Protein Isolate Shake", 1.0, "With 2 sea salt rice cakes", 195, 28.4, 17.0, 1.5),
            ("dinner", "Tuna Steak (Seared)", 1.2, "Seared sesame tuna + jasmine rice & broccoli", 524, 60.7, 61.2, 3.5),
        ],
        "friday": [
            ("breakfast", "Whole Large Eggs", 1.5, "3 eggs + 150ml egg whites scramble & toast", 443, 41.4, 31.2, 15.5),
            ("lunch", "Lean Ground Beef (93/7)", 1.2, "With 200g baked sweet potato & peppers", 496, 43.4, 50.2, 13.3),
            ("snack", "Greek Yogurt (0% Fat Plain)", 1.0, "With 150g strawberries", 166, 21.6, 18.7, 0.9),
            ("dinner", "Mediterranean Salmon & Brown Rice Plate", 1.0, "Friday omega-3 dinner", 620, 41.0, 56.0, 24.0),
        ],
        "saturday": [
            ("breakfast", "Rolled Oats (Dry)", 1.2, "Weekend pancakes with oats, eggs & blueberries", 480, 34.0, 63.0, 9.5),
            ("lunch", "Chicken Power Bowl (Quinoa, Greens, Avocado)", 1.0, "Post-lower-body training meal", 565, 48.0, 52.0, 18.5),
            ("snack", "Whey Protein Isolate Shake", 1.0, "With 30g raw walnuts & almonds", 310, 32.2, 6.8, 17.5),
            ("dinner", "Grilled Chicken Breast", 1.2, "With baked sweet potato & roasted asparagus", 511, 63.4, 47.6, 7.1),
        ],
        "sunday": [
            ("breakfast", "Greek Yogurt (0% Fat Plain)", 1.5, "Parfait with berries & almond butter", 332, 35.0, 28.3, 9.8),
            ("lunch", "Atlantic Salmon Fillet", 1.0, "With cooked quinoa & baby spinach salad", 557, 44.0, 43.0, 23.5),
            ("snack", "Low-Fat Cottage Cheese", 1.0, "With dark chocolate square (25g)", 272, 20.2, 13.6, 15.2),
            ("dinner", "Grilled Chicken Breast", 1.2, "Sunday meal prep batch + jasmine rice & broccoli", 584, 64.3, 61.2, 7.6),
        ],
    }

    for day in days_of_week:
        for idx, (m_type, f_name, serv, notes, cal, prot, carb, fat) in enumerate(weekly_plan_templates[day]):
            f_row = food_map.get(f_name)
            f_id = f_row[0] if f_row else None
            s_unit = f_row[3] if f_row else "serving"
            is_done = 1 if day in ("monday", "tuesday", "wednesday", "thursday", "friday") and idx < 3 else 0
            cur.execute(
                """
                INSERT INTO meal_plans (
                    day_of_week, meal_type, food_id, meal_name, servings, serving_unit,
                    calories, protein_g, carbs_g, fat_g, prep_notes, is_completed, order_index
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (day, m_type, f_id, f_name, serv, s_unit, cal, prot, carb, fat, notes, is_done, idx),
            )

    # 5. Seed Exercise Library (24 exercises across 8 muscle groups)
    exercises_data = [
        ("Barbell Bench Press", "Chest", "Barbell", "Compound", "Retract scapulae, plant feet firmly, lower bar to mid-chest and press up."),
        ("Incline Dumbbell Press", "Chest", "Dumbbell", "Compound", "Set bench to 30 degrees, lower dumbbells with elbows at 45 degrees."),
        ("Cable Chest Fly", "Chest", "Cable", "Isolation", "Slight bend in elbows, bring handles together in a wide arc squeezing pecs."),
        ("Barbell Back Squat", "Legs", "Barbell", "Compound", "Brace core, sit hips back and down until thighs break parallel, drive through mid-foot."),
        ("Romanian Deadlift (RDL)", "Legs", "Barbell", "Compound", "Hinge at hips with soft knees, keep bar close to shins until deep hamstring stretch."),
        ("Leg Press", "Legs", "Machine", "Compound", "Place feet shoulder-width on sled, lower under control without rounding lower back."),
        ("Lying Leg Curl", "Legs", "Machine", "Isolation", "Keep hips pressed into pad, curl pad toward glutes and squeeze hamstrings."),
        ("Standing Calf Raise", "Legs", "Machine", "Isolation", "Full stretch at bottom, pause 1 second at top contraction."),
        ("Weighted Pull-Up", "Back", "Bodyweight", "Compound", "Pull elbows down toward ribs until chin clears bar; control the eccentric."),
        ("Barbell Bent-Over Row", "Back", "Barbell", "Compound", "Hinge torso to 45 degrees, row bar into lower sternum squeezing lats."),
        ("Lat Pulldown (Wide Grip)", "Back", "Cable", "Compound", "Lead with elbows, pull bar to upper chest while keeping torso tall."),
        ("Seated Cable Row", "Back", "Cable", "Compound", "Keep chest up, pull handle to navel and squeeze shoulder blades together."),
        ("Overhead Barbell Press", "Shoulders", "Barbell", "Compound", "Brace glutes and abs, press bar vertically overhead and lock out."),
        ("Seated Dumbbell Shoulder Press", "Shoulders", "Dumbbell", "Compound", "Press dumbbells overhead without clanking at the top; lower to ear level."),
        ("Dumbbell Lateral Raise", "Shoulders", "Dumbbell", "Isolation", "Lead with elbows slightly forward in the scapular plane up to shoulder height."),
        ("Face Pull", "Shoulders", "Cable", "Isolation", "Pull rope toward forehead while externally rotating shoulders."),
        ("EZ-Bar Bicep Curl", "Arms", "Barbell", "Isolation", "Keep elbows pinned to sides, curl bar up and lower over 2 seconds."),
        ("Incline Dumbbell Hammer Curl", "Arms", "Dumbbell", "Isolation", "Neutral grip, curl dumbbells without swinging shoulders."),
        ("Rope Tricep Pushdown", "Arms", "Cable", "Isolation", "Keep elbows stationary, extend forearms and spread rope at bottom."),
        ("Overhead Cable Tricep Extension", "Arms", "Cable", "Isolation", "Stretch long head of triceps overhead and extend to full lockout."),
        ("Hanging Leg Raise", "Core", "Bodyweight", "Isolation", "Posteriorly tilt pelvis as you raise legs to engage lower abs."),
        ("Cable Woodchopper", "Core", "Cable", "Isolation", "Rotate torso smoothly through obliques while keeping hips stable."),
        ("Ab Wheel Rollout", "Core", "Bodyweight", "Compound", "Maintain hollow body tension, roll out as far as lower back stays flat."),
        ("Incline Treadmill Walk / HIIT Bike", "Cardio", "Cardio", "Cardio", "Steady Zone 2 incline walk or structured high-intensity intervals."),
    ]

    cur.executemany(
        """
        INSERT INTO exercises (name, muscle_group, equipment, movement_type, instructions, is_custom)
        VALUES (?, ?, ?, ?, ?, 0)
        """,
        exercises_data,
    )

    cur.execute("SELECT id, name FROM exercises")
    ex_map = {row[1]: row[0] for row in cur.fetchall()}

    # 6. Seed 7-Day Workout Schedule (workout_plans + workout_plan_exercises)
    schedule_data = [
        (
            "monday",
            "Push Day A — Chest, Shoulders & Triceps",
            "Chest, Shoulders & Triceps",
            65,
            0,
            "Heavy compound pressing followed by medial delt and tricep hypertrophy.",
            [
                ("Barbell Bench Press", 4, "6-8", 85.0, 150, "Top set RPE 8.5"),
                ("Incline Dumbbell Press", 3, "8-10", 32.5, 120, "30-degree incline"),
                ("Overhead Barbell Press", 3, "8-10", 52.5, 120, "Strict standing press"),
                ("Dumbbell Lateral Raise", 4, "12-15", 12.5, 60, "Controlled eccentric"),
                ("Rope Tricep Pushdown", 3, "12-15", 27.5, 60, "Spread rope at bottom"),
            ],
        ),
        (
            "tuesday",
            "Pull Day A — Back Width, Thickness & Biceps",
            "Back, Rear Delts & Biceps",
            65,
            0,
            "Vertical and horizontal pulling with strict scapular control.",
            [
                ("Weighted Pull-Up", 4, "6-8", 12.5, 150, "Add weight on dip belt"),
                ("Barbell Bent-Over Row", 4, "8-10", 77.5, 120, "Row to lower ribs"),
                ("Seated Cable Row", 3, "10-12", 65.0, 90, "Pause 1s at contraction"),
                ("Face Pull", 3, "15-18", 22.5, 60, "External rotation focus"),
                ("EZ-Bar Bicep Curl", 3, "10-12", 35.0, 75, "Full range of motion"),
            ],
        ),
        (
            "wednesday",
            "Legs A — Quad Focus & Posterior Chain",
            "Quads, Hamstrings & Calves",
            70,
            0,
            "Primary squat progression paired with hamstring lengthening work.",
            [
                ("Barbell Back Squat", 4, "6-8", 110.0, 180, "Depth below parallel"),
                ("Romanian Deadlift (RDL)", 3, "8-10", 95.0, 120, "Slow 3s lowering phase"),
                ("Leg Press", 3, "10-12", 180.0, 120, "Mid-foot stance"),
                ("Lying Leg Curl", 3, "12-15", 50.0, 75, "Keep hips down"),
                ("Standing Calf Raise", 4, "15-20", 70.0, 60, "2s pause at stretch"),
            ],
        ),
        (
            "thursday",
            "Active Recovery, Core Stability & Zone 2 Cardio",
            "Core & Cardiovascular Conditioning",
            45,
            0,
            "Low-fatigue trunk stability work and 25 minutes of Zone 2 incline walking.",
            [
                ("Hanging Leg Raise", 4, "12-15", 0.0, 60, "Control swing"),
                ("Ab Wheel Rollout", 3, "10-12", 0.0, 75, "Posterior pelvic tilt"),
                ("Cable Woodchopper", 3, "12-15", 20.0, 60, "Each side"),
                ("Incline Treadmill Walk / HIIT Bike", 1, "25 min", 0.0, 60, "12% incline, 5.2 km/h"),
            ],
        ),
        (
            "friday",
            "Upper Body Hypertrophy — Chest, Back & Arms",
            "Upper Body Hypertrophy",
            65,
            0,
            "Higher volume upper-body session emphasizing metabolic stress and mind-muscle connection.",
            [
                ("Incline Dumbbell Press", 4, "8-10", 35.0, 120, "Deep stretch at bottom"),
                ("Lat Pulldown (Wide Grip)", 4, "10-12", 67.5, 90, "Pull elbows to hips"),
                ("Seated Dumbbell Shoulder Press", 3, "10-12", 25.0, 90, "Full control"),
                ("Cable Chest Fly", 3, "12-15", 20.0, 60, "Peak contraction"),
                ("Incline Dumbbell Hammer Curl", 3, "10-12", 16.0, 60, "Superset with triceps"),
                ("Overhead Cable Tricep Extension", 3, "12-15", 25.0, 60, "Long head stretch"),
            ],
        ),
        (
            "saturday",
            "Lower Body Strength & Conditioning",
            "Legs & Core",
            65,
            0,
            "Posterior chain emphasis with unilateral stability and core finisher.",
            [
                ("Romanian Deadlift (RDL)", 4, "6-8", 102.5, 150, "Primary hinge progression"),
                ("Barbell Back Squat", 3, "8-10", 102.5, 150, "Paused bottom reps"),
                ("Lying Leg Curl", 3, "10-12", 52.5, 75, "Controlled negative"),
                ("Standing Calf Raise", 4, "12-15", 75.0, 60, "Full stretch"),
                ("Hanging Leg Raise", 3, "12-15", 0.0, 60, "Core finisher"),
            ],
        ),
        (
            "sunday",
            "Full Rest & Meal Prep Day",
            "Recovery & Mobility",
            0,
            1,
            "Complete recovery day. Focus on hydration, 8+ hours sleep, light stretching, and weekly meal prep.",
            [],
        ),
    ]

    plan_id_by_day = {}
    for day, title, focus, duration, is_rest, notes, ex_items in schedule_data:
        cur.execute(
            """
            INSERT INTO workout_plans (
                day_of_week, title, focus_area, estimated_duration_min, is_rest_day, notes
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (day, title, focus, duration, is_rest, notes),
        )
        p_id = cur.lastrowid
        plan_id_by_day[day] = p_id
        for idx, (ex_name, t_sets, t_reps, t_weight, rest_s, ex_note) in enumerate(ex_items):
            cur.execute(
                """
                INSERT INTO workout_plan_exercises (
                    workout_plan_id, exercise_id, order_index, target_sets,
                    target_reps, target_weight_kg, rest_seconds, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (p_id, ex_map[ex_name], idx, t_sets, t_reps, t_weight, rest_s, ex_note),
            )

    # 7. Seed Completed Workout Sessions (workout_logs + workout_log_sets)
    logged_sessions = [
        (
            (today - timedelta(days=5)).isoformat(),
            "monday",
            "Push Day A — Chest, Shoulders & Triceps",
            "Chest, Shoulders & Triceps",
            64,
            410,
            "Felt strong on bench press; hit 85kg for 8 clean reps on top set.",
            [
                ("Barbell Bench Press", 1, 8, 60.0, 6.0, 1, 0),
                ("Barbell Bench Press", 2, 8, 82.5, 8.0, 0, 0),
                ("Barbell Bench Press", 3, 8, 85.0, 8.5, 0, 1),
                ("Barbell Bench Press", 4, 7, 85.0, 9.0, 0, 0),
                ("Incline Dumbbell Press", 1, 10, 32.5, 8.0, 0, 0),
                ("Incline Dumbbell Press", 2, 9, 32.5, 8.5, 0, 0),
                ("Incline Dumbbell Press", 3, 8, 32.5, 9.0, 0, 0),
                ("Overhead Barbell Press", 1, 8, 52.5, 8.0, 0, 0),
                ("Overhead Barbell Press", 2, 8, 52.5, 8.5, 0, 0),
                ("Dumbbell Lateral Raise", 1, 15, 12.5, 8.0, 0, 0),
                ("Dumbbell Lateral Raise", 2, 14, 12.5, 8.5, 0, 0),
                ("Rope Tricep Pushdown", 1, 14, 27.5, 8.0, 0, 0),
                ("Rope Tricep Pushdown", 2, 12, 27.5, 8.5, 0, 0),
            ],
        ),
        (
            (today - timedelta(days=4)).isoformat(),
            "tuesday",
            "Pull Day A — Back Width, Thickness & Biceps",
            "Back, Rear Delts & Biceps",
            62,
            395,
            "Great lat pump on weighted pull-ups and rows.",
            [
                ("Weighted Pull-Up", 1, 8, 10.0, 8.0, 0, 0),
                ("Weighted Pull-Up", 2, 8, 12.5, 8.5, 0, 1),
                ("Weighted Pull-Up", 3, 7, 12.5, 9.0, 0, 0),
                ("Barbell Bent-Over Row", 1, 10, 75.0, 8.0, 0, 0),
                ("Barbell Bent-Over Row", 2, 9, 77.5, 8.5, 0, 1),
                ("Barbell Bent-Over Row", 3, 8, 77.5, 8.5, 0, 0),
                ("Seated Cable Row", 1, 12, 65.0, 8.0, 0, 0),
                ("Seated Cable Row", 2, 11, 65.0, 8.5, 0, 0),
                ("EZ-Bar Bicep Curl", 1, 12, 35.0, 8.0, 0, 0),
                ("EZ-Bar Bicep Curl", 2, 10, 35.0, 8.5, 0, 0),
            ],
        ),
        (
            (today - timedelta(days=3)).isoformat(),
            "wednesday",
            "Legs A — Quad Focus & Posterior Chain",
            "Quads, Hamstrings & Calves",
            72,
            485,
            "New squat volume PR at 110kg for 8 reps!",
            [
                ("Barbell Back Squat", 1, 8, 80.0, 6.0, 1, 0),
                ("Barbell Back Squat", 2, 8, 107.5, 8.0, 0, 0),
                ("Barbell Back Squat", 3, 8, 110.0, 8.5, 0, 1),
                ("Barbell Back Squat", 4, 7, 110.0, 9.0, 0, 0),
                ("Romanian Deadlift (RDL)", 1, 10, 95.0, 8.0, 0, 0),
                ("Romanian Deadlift (RDL)", 2, 9, 95.0, 8.5, 0, 0),
                ("Romanian Deadlift (RDL)", 3, 8, 95.0, 8.5, 0, 0),
                ("Leg Press", 1, 12, 180.0, 8.0, 0, 0),
                ("Leg Press", 2, 12, 180.0, 8.5, 0, 0),
                ("Lying Leg Curl", 1, 14, 50.0, 8.0, 0, 0),
                ("Standing Calf Raise", 1, 18, 70.0, 8.5, 0, 0),
            ],
        ),
        (
            (today - timedelta(days=1)).isoformat(),
            "friday",
            "Upper Body Hypertrophy — Chest, Back & Arms",
            "Upper Body Hypertrophy",
            66,
            420,
            "Moved up to 35kg dumbbells on incline press.",
            [
                ("Incline Dumbbell Press", 1, 10, 35.0, 8.5, 0, 1),
                ("Incline Dumbbell Press", 2, 9, 35.0, 8.5, 0, 0),
                ("Incline Dumbbell Press", 3, 8, 35.0, 9.0, 0, 0),
                ("Lat Pulldown (Wide Grip)", 1, 12, 67.5, 8.0, 0, 1),
                ("Lat Pulldown (Wide Grip)", 2, 11, 67.5, 8.5, 0, 0),
                ("Lat Pulldown (Wide Grip)", 3, 10, 67.5, 9.0, 0, 0),
                ("Seated Dumbbell Shoulder Press", 1, 11, 25.0, 8.0, 0, 0),
                ("Seated Dumbbell Shoulder Press", 2, 10, 25.0, 8.5, 0, 0),
                ("Cable Chest Fly", 1, 15, 20.0, 8.0, 0, 0),
                ("Incline Dumbbell Hammer Curl", 1, 12, 16.0, 8.0, 0, 0),
                ("Overhead Cable Tricep Extension", 1, 14, 25.0, 8.5, 0, 0),
            ],
        ),
    ]

    for w_date, day_key, title, focus, dur, cals, notes, sets_list in logged_sessions:
        cur.execute(
            """
            INSERT INTO workout_logs (
                date, workout_plan_id, title, focus_area, duration_min, calories_burned, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (w_date, plan_id_by_day.get(day_key), title, focus, dur, cals, notes),
        )
        w_log_id = cur.lastrowid
        for ex_name, set_num, reps, weight_kg, rpe, is_warmup, is_pr in sets_list:
            est_1rm = calculate_1rm(weight_kg, reps)["estimated_1rm"] if weight_kg > 0 else 0.0
            cur.execute(
                """
                INSERT INTO workout_log_sets (
                    workout_log_id, exercise_id, exercise_name, set_number,
                    reps, weight_kg, rpe, is_warmup, is_pr, estimated_1rm
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    w_log_id,
                    ex_map.get(ex_name),
                    ex_name,
                    set_num,
                    reps,
                    weight_kg,
                    rpe,
                    is_warmup,
                    is_pr,
                    est_1rm,
                ),
            )

    # 8. Seed Hydration Logs (Past 7 days + Today)
    for days_ago in range(7, 0, -1):
        d_str = (today - timedelta(days=days_ago)).isoformat()
        entries = [
            (500, "Morning wake-up hydration"),
            (750, "Pre & intra-workout bottle"),
            (500, "With lunch"),
            (750, "Afternoon desk bottle"),
            (500, "Evening hydration"),
        ]
        for amt, note in entries:
            cur.execute(
                "INSERT INTO water_logs (date, amount_ml, note) VALUES (?, ?, ?)",
                (d_str, amt, note),
            )

    # Today's partial water intake so the user sees progress and can add more
    today_str = today.isoformat()
    today_water = [
        (500, "Morning glass upon waking"),
        (750, "Gym bottle during morning training"),
        (500, "Lunch hydration"),
        (500, "Afternoon refill"),
    ]
    for amt, note in today_water:
        cur.execute(
            "INSERT INTO water_logs (date, amount_ml, note) VALUES (?, ?, ?)",
            (today_str, amt, note),
        )

    # 9. Seed 14-Day Body Weight Progression
    weight_progression = [
        (13, 80.2, 16.8, "Starting cut phase"),
        (12, 80.0, 16.7, "Morning fasted weigh-in"),
        (11, 79.9, 16.7, "Consistent sodium"),
        (10, 79.7, 16.6, "After rest day"),
        (9, 79.8, 16.6, "High-carb leg day yesterday"),
        (8, 79.5, 16.5, "New low weigh-in"),
        (7, 79.4, 16.4, "End of week 1"),
        (6, 79.3, 16.4, "Feeling energetic"),
        (5, 79.1, 16.3, "Post push day"),
        (4, 79.0, 16.2, "Steady drop"),
        (3, 78.9, 16.2, "Mid-week check"),
        (2, 78.7, 16.1, "Good recovery"),
        (1, 78.6, 16.0, "Almost 1.5kg down"),
        (0, 78.5, 15.9, "Today's morning weigh-in"),
    ]

    for days_ago, w_kg, bf_pct, note in weight_progression:
        d_str = (today - timedelta(days=days_ago)).isoformat()
        cur.execute(
            """
            INSERT OR REPLACE INTO weight_logs (date, weight_kg, body_fat_pct, notes)
            VALUES (?, ?, ?, ?)
            """,
            (d_str, w_kg, bf_pct, note),
        )

    conn.commit()


def init_db(db_path: Path = DEFAULT_DB_PATH, reset: bool = False):
    db_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(db_path))
    try:
        if reset:
            cur = conn.cursor()
            tables = [
                "workout_log_sets",
                "workout_logs",
                "workout_plan_exercises",
                "workout_plans",
                "exercises",
                "meal_plans",
                "food_logs",
                "foods",
                "water_logs",
                "weight_logs",
                "user_profile",
            ]
            cur.execute("PRAGMA foreign_keys = OFF;")
            for t in tables:
                cur.execute(f"DROP TABLE IF EXISTS {t};")
            conn.commit()

        conn.executescript(SCHEMA_SQL)

        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM foods")
        food_count = cur.fetchone()[0]

        if food_count == 0 or reset:
            seed_database(conn)
            print(f"[init_db] Database initialized and seeded at: {db_path}")
        else:
            print(f"[init_db] Database already initialized ({food_count} foods found) at: {db_path}")
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description="Initialize and seed Foody SQLite database")
    parser.add_argument("--db-path", type=str, default=str(DEFAULT_DB_PATH))
    parser.add_argument("--reset", action="store_true", help="Drop existing tables and re-seed")
    args = parser.parse_args()
    init_db(Path(args.db_path), reset=args.reset)


if __name__ == "__main__":
    main()
