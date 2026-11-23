#!/usr/bin/env python3
"""
Deterministic Nutrition & Strength Calculation Engine for Foody.
Computes BMR (Mifflin-St Jeor), TDEE, daily calorie and macro targets,
daily water intake targets, and estimated 1-Rep Max (Epley formula).
"""

import argparse
import json
import sys

ACTIVITY_MULTIPLIERS = {
    "sedentary": 1.2,
    "light": 1.375,
    "moderate": 1.55,
    "active": 1.725,
    "very_active": 1.9,
}

ACTIVITY_WATER_BONUS_ML = {
    "sedentary": 0,
    "light": 250,
    "moderate": 500,
    "active": 750,
    "very_active": 1000,
}

GOAL_CALORIE_OFFSET = {
    "cut": -450,
    "maintain": 0,
    "bulk": 300,
}

DIET_MACRO_SPLITS = {
    "balanced": {"protein": 0.30, "carbs": 0.40, "fat": 0.30},
    "high_protein": {"protein": 0.35, "carbs": 0.40, "fat": 0.25},
    "low_carb": {"protein": 0.35, "carbs": 0.25, "fat": 0.40},
    "keto": {"protein": 0.30, "carbs": 0.05, "fat": 0.65},
}


def calculate_nutrition_targets(
    weight_kg: float,
    height_cm: float,
    age: int,
    gender: str = "male",
    activity_level: str = "moderate",
    goal: str = "cut",
    diet_preference: str = "high_protein",
) -> dict:
    """Compute BMR, TDEE, daily calorie target, macro targets, and hydration target."""
    gender_norm = (gender or "male").lower().strip()
    activity_norm = (activity_level or "moderate").lower().strip()
    goal_norm = (goal or "maintain").lower().strip()
    diet_norm = (diet_preference or "balanced").lower().strip()

    if activity_norm not in ACTIVITY_MULTIPLIERS:
        activity_norm = "moderate"
    if goal_norm not in GOAL_CALORIE_OFFSET:
        goal_norm = "maintain"
    if diet_norm not in DIET_MACRO_SPLITS:
        diet_norm = "balanced"

    # Mifflin-St Jeor Equation
    base_bmr = (10.0 * float(weight_kg)) + (6.25 * float(height_cm)) - (5.0 * int(age))
    bmr = round(base_bmr + 5) if gender_norm != "female" else round(base_bmr - 161)

    multiplier = ACTIVITY_MULTIPLIERS[activity_norm]
    tdee = round(bmr * multiplier)

    offset = GOAL_CALORIE_OFFSET[goal_norm]
    daily_calorie_target = max(1200, tdee + offset)

    splits = DIET_MACRO_SPLITS[diet_norm]
    daily_protein_g = round((daily_calorie_target * splits["protein"]) / 4.0)
    daily_carbs_g = round((daily_calorie_target * splits["carbs"]) / 4.0)
    daily_fat_g = round((daily_calorie_target * splits["fat"]) / 9.0)
    daily_fiber_g = max(25, min(45, round((daily_calorie_target / 1000.0) * 14.0)))

    raw_water_ml = (float(weight_kg) * 35.0) + ACTIVITY_WATER_BONUS_ML[activity_norm]
    daily_water_ml = int(round(raw_water_ml / 50.0) * 50)

    return {
        "bmr": bmr,
        "tdee": tdee,
        "activity_multiplier": multiplier,
        "goal_calorie_offset": offset,
        "daily_calorie_target": daily_calorie_target,
        "daily_protein_g": daily_protein_g,
        "daily_carbs_g": daily_carbs_g,
        "daily_fat_g": daily_fat_g,
        "daily_fiber_g": daily_fiber_g,
        "daily_water_ml": daily_water_ml,
        "macro_split_pct": {
            "protein": int(splits["protein"] * 100),
            "carbs": int(splits["carbs"] * 100),
            "fat": int(splits["fat"] * 100),
        },
    }


def calculate_1rm(weight_kg: float, reps: int) -> dict:
    """Compute estimated One-Rep Max (Epley formula) and training load percentages."""
    w = float(weight_kg)
    r = int(reps)
    if w <= 0 or r <= 0:
        return {"estimated_1rm": 0.0, "percentages": {}}
    est_1rm = round(w if r == 1 else w * (1.0 + (r / 30.0)), 1)
    percentages = {
        f"{pct}%": round(est_1rm * (pct / 100.0), 1)
        for pct in (95, 90, 85, 80, 75, 70, 65, 60)
    }
    return {
        "weight_kg": w,
        "reps": r,
        "estimated_1rm": est_1rm,
        "percentages": percentages,
    }


def main():
    parser = argparse.ArgumentParser(description="Foody Nutrition & 1RM Calculator")
    parser.add_argument("--weight", type=float, default=78.5, help="Weight in kg")
    parser.add_argument("--height", type=float, default=178.0, help="Height in cm")
    parser.add_argument("--age", type=int, default=27, help="Age in years")
    parser.add_argument("--gender", type=str, default="male", choices=["male", "female"])
    parser.add_argument(
        "--activity",
        type=str,
        default="moderate",
        choices=list(ACTIVITY_MULTIPLIERS.keys()),
    )
    parser.add_argument(
        "--goal", type=str, default="cut", choices=list(GOAL_CALORIE_OFFSET.keys())
    )
    parser.add_argument(
        "--diet",
        type=str,
        default="high_protein",
        choices=list(DIET_MACRO_SPLITS.keys()),
    )
    parser.add_argument("--lift-weight", type=float, help="Optional lift weight in kg for 1RM")
    parser.add_argument("--lift-reps", type=int, help="Optional lift reps for 1RM")

    args = parser.parse_args()
    result = calculate_nutrition_targets(
        weight_kg=args.weight,
        height_cm=args.height,
        age=args.age,
        gender=args.gender,
        activity_level=args.activity,
        goal=args.goal,
        diet_preference=args.diet,
    )
    if args.lift_weight and args.lift_reps:
        result["strength_1rm"] = calculate_1rm(args.lift_weight, args.lift_reps)

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
