#!/usr/bin/env python3
"""
Deterministic End-to-End API Verification Suite for Foody.
Starts the Node.js Express server on a test port (or connects if running),
exercises all REST endpoints across Profile, TDEE/1RM Calculator, Foods,
Food Logs, Weekly Meal Planner, Exercise Library, Workout Schedule,
Workout Session Tracker, Hydration, Body Weight, Dashboard, and Analytics,
and verifies data integrity.
"""

import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT_DIR = Path(__file__).resolve().parent.parent
TEST_PORT = 3099
BASE_URL = f"http://localhost:{TEST_PORT}/api"


def api_request(method: str, path: str, payload: dict = None) -> tuple[int, dict]:
    url = f"{BASE_URL}{path}"
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        return e.code, json.loads(body) if body else {"error": str(e)}


def assert_status(actual: int, expected: int, label: str, resp_data):
    if actual != expected:
        raise AssertionError(
            f"[{label}] Expected HTTP {expected}, got {actual}. Response: {resp_data}"
        )
    print(f"  [PASS] {label} (HTTP {actual})")


def run_tests():
    print("=== Foody End-to-End API Test Suite ===")

    # 1. Health check
    status, data = api_request("GET", "/health")
    assert_status(status, 200, "GET /api/health", data)
    assert data["status"] == "ok" and data["counts"]["foods"] >= 30

    # 2. Dashboard
    status, dash = api_request("GET", "/dashboard")
    assert_status(status, 200, "GET /api/dashboard", dash)
    assert "profile" in dash and "nutrition" in dash and "hydration" in dash
    assert "today_meal_plan" in dash and "today_workout_plan" in dash

    # 3. Profile & TDEE/1RM Calculator
    status, prof = api_request("GET", "/profile")
    assert_status(status, 200, "GET /api/profile", prof)
    assert prof["name"] == "Alex Rivera" and prof["bmr"] > 1500

    status, calc = api_request(
        "POST",
        "/calculator/tdee",
        {
            "weight_kg": 80,
            "height_cm": 180,
            "age": 25,
            "gender": "male",
            "activity_level": "active",
            "goal": "bulk",
            "diet_preference": "high_protein",
        },
    )
    assert_status(status, 200, "POST /api/calculator/tdee", calc)
    assert calc["daily_calorie_target"] > calc["tdee"]

    status, orm = api_request("POST", "/calculator/1rm", {"weight_kg": 100, "reps": 5})
    assert_status(status, 200, "POST /api/calculator/1rm", orm)
    assert orm["estimated_1rm"] == 116.7

    # 4. Foods Catalog CRUD & Favorites
    status, foods = api_request("GET", "/foods?q=chicken")
    assert_status(status, 200, "GET /api/foods?q=chicken", foods)
    assert foods["total"] >= 1

    status, custom_food = api_request(
        "POST",
        "/foods",
        {
            "name": "Test Protein Pancakes",
            "category": "Prepared Meals",
            "serving_size": 1,
            "serving_unit": "serving (200g)",
            "calories": 380,
            "protein_g": 34,
            "carbs_g": 45,
            "fat_g": 7,
            "fiber_g": 5,
            "is_favorite": True,
        },
    )
    assert_status(status, 201, "POST /api/foods", custom_food)
    custom_food_id = custom_food["id"]

    status, fav_toggle = api_request("PATCH", f"/foods/{custom_food_id}/favorite", {})
    assert_status(status, 200, "PATCH /api/foods/:id/favorite", fav_toggle)
    assert fav_toggle["is_favorite"] == 0

    # 5. Daily Food Logs CRUD
    status, created_log = api_request(
        "POST",
        "/food-logs",
        {
            "meal_type": "snack",
            "food_id": custom_food_id,
            "servings": 1.5,
            "notes": "Afternoon test pancake snack",
        },
    )
    assert_status(status, 201, "POST /api/food-logs (from catalog)", created_log)
    log_id = created_log["entry"]["id"]
    assert created_log["entry"]["calories"] == 570  # 380 * 1.5

    status, updated_log = api_request("PUT", f"/food-logs/{log_id}", {"servings": 1.0})
    assert_status(status, 200, "PUT /api/food-logs/:id", updated_log)
    assert updated_log["entry"]["calories"] == 380

    status, del_log = api_request("DELETE", f"/food-logs/{log_id}")
    assert_status(status, 200, "DELETE /api/food-logs/:id", del_log)

    # Clean up custom food
    status, _ = api_request("DELETE", f"/foods/{custom_food_id}")
    assert_status(status, 200, "DELETE /api/foods/:id", _)

    # 6. Weekly Meal Planner CRUD & Log-to-Today
    status, mp = api_request("GET", "/meal-plans")
    assert_status(status, 200, "GET /api/meal-plans", mp)
    assert "monday" in mp["days"] and len(mp["days"]["monday"]["items"]) >= 4

    status, new_plan_item = api_request(
        "POST",
        "/meal-plans",
        {
            "day_of_week": "sunday",
            "meal_type": "snack",
            "meal_name": "Evening Casein Pudding",
            "servings": 1,
            "serving_unit": "bowl",
            "calories": 160,
            "protein_g": 30,
            "carbs_g": 6,
            "fat_g": 2,
            "prep_notes": "Mix with cold water & chill",
        },
    )
    assert_status(status, 201, "POST /api/meal-plans", new_plan_item)
    mp_id = new_plan_item["id"]

    status, logged_from_plan = api_request("POST", f"/meal-plans/{mp_id}/log", {})
    assert_status(status, 201, "POST /api/meal-plans/:id/log", logged_from_plan)
    logged_entry_id = logged_from_plan["logged_entry"]["id"]

    # Clean up temporary logged meal & plan item
    api_request("DELETE", f"/food-logs/{logged_entry_id}")
    status, _ = api_request("DELETE", f"/meal-plans/{mp_id}")
    assert_status(status, 200, "DELETE /api/meal-plans/:id", _)

    # 7. Exercises, Workout Plans & Workout Session Logs
    status, ex_list = api_request("GET", "/exercises?muscle_group=Chest")
    assert_status(status, 200, "GET /api/exercises?muscle_group=Chest", ex_list)
    assert ex_list["total"] >= 3
    bench_id = ex_list["items"][0]["id"]

    status, ex_hist = api_request("GET", f"/exercises/{bench_id}/history")
    assert_status(status, 200, "GET /api/exercises/:id/history", ex_hist)

    status, w_plans = api_request("GET", "/workout-plans")
    assert_status(status, 200, "GET /api/workout-plans", w_plans)
    assert len(w_plans) == 7

    status, new_w_log = api_request(
        "POST",
        "/workout-logs",
        {
            "title": "Test Express Upper Session",
            "focus_area": "Chest & Back",
            "duration_min": 45,
            "calories_burned": 310,
            "sets": [
                {
                    "exercise_id": bench_id,
                    "set_number": 1,
                    "reps": 8,
                    "weight_kg": 87.5,
                    "rpe": 8.5,
                    "is_warmup": False,
                }
            ],
        },
    )
    assert_status(status, 201, "POST /api/workout-logs", new_w_log)
    w_log_id = new_w_log["id"]
    assert new_w_log["total_volume_kg"] == 700

    status, _ = api_request("DELETE", f"/workout-logs/{w_log_id}")
    assert_status(status, 200, "DELETE /api/workout-logs/:id", _)

    # 8. Hydration & Weight Logs + Analytics
    status, water_add = api_request(
        "POST", "/water-logs", {"amount_ml": 300, "note": "Test glass"}
    )
    assert_status(status, 201, "POST /api/water-logs", water_add)
    water_id = water_add["entry"]["id"]

    status, _ = api_request("DELETE", f"/water-logs/{water_id}")
    assert_status(status, 200, "DELETE /api/water-logs/:id", _)

    status, weight_data = api_request("GET", "/weight-logs?days=14")
    assert_status(status, 200, "GET /api/weight-logs?days=14", weight_data)
    assert len(weight_data["entries"]) >= 10

    status, analytics = api_request("GET", "/analytics?days=14")
    assert_status(status, 200, "GET /api/analytics?days=14", analytics)
    assert len(analytics["nutrition_series"]) == 14
    assert analytics["workout_summary"]["total_sessions"] >= 4

    # 9. Pluggable AI Meal Analysis & Photo Storage
    status, ai_res = api_request(
        "POST",
        "/ai/analyze-meal",
        {
            "meal_name": "Grilled Chicken and Rice",
            "meal_type": "lunch",
            "image_data": "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
        },
    )
    assert_status(status, 200, "POST /api/ai/analyze-meal", ai_res)
    assert ai_res["calories"] > 0 and ai_res["protein_g"] > 0 and "health_note" in ai_res

    print("\nAll end-to-end API assertions passed successfully!")


def main():
    env = os.environ.copy()
    env["PORT"] = str(TEST_PORT)
    server_proc = subprocess.Popen(
        ["node", str(ROOT_DIR / "server" / "index.js")],
        cwd=str(ROOT_DIR),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    try:
        # Wait for server to become ready
        ready = False
        for _ in range(25):
            try:
                status, _ = api_request("GET", "/health")
                if status == 200:
                    ready = True
                    break
            except Exception:
                time.sleep(0.2)
        if not ready:
            out, err = server_proc.communicate(timeout=2)
            raise RuntimeError(
                f"Server failed to start on port {TEST_PORT}.\nSTDOUT: {out.decode()}\nSTDERR: {err.decode()}"
            )

        run_tests()
    finally:
        server_proc.terminate()
        try:
            server_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server_proc.kill()


if __name__ == "__main__":
    main()
