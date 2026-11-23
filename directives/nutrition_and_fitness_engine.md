# Directive: Nutrition & Fitness Calculation Engine

## Goal
Ensure all nutritional calculations (BMR, TDEE, daily calorie targets, macro distributions, hydration targets) and fitness metrics (workout volume, Epley 1RM, personal record detection) are 100% deterministic across Python execution tools and Node.js API endpoints.

## 1. Basal Metabolic Rate (BMR) — Mifflin-St Jeor Equation
- **Male**: $\text{BMR} = (10 \times \text{weight\_kg}) + (6.25 \times \text{height\_cm}) - (5 \times \text{age}) + 5$
- **Female**: $\text{BMR} = (10 \times \text{weight\_kg}) + (6.25 \times \text{height\_cm}) - (5 \times \text{age}) - 161$

## 2. Total Daily Energy Expenditure (TDEE) Multipliers
| `activity_level` | Multiplier | Description |
| :--- | :--- | :--- |
| `sedentary` | `1.2` | Desk job, little to no formal exercise |
| `light` | `1.375` | Light exercise or sports 1–3 days/week |
| `moderate` | `1.55` | Moderate training 3–5 days/week |
| `active` | `1.725` | Hard training 6–7 days/week |
| `very_active` | `1.9` | Very intense daily training or physical labor |

$$\text{TDEE} = \text{round}(\text{BMR} \times \text{multiplier})$$

## 3. Goal Calorie Adjustment
| `goal` | Calorie Adjustment | Notes |
| :--- | :--- | :--- |
| `cut` | $\text{TDEE} - 450\text{ kcal}$ | Sustainable fat loss (~0.4–0.5 kg/week), minimum floor 1200 kcal |
| `maintain` | $\text{TDEE}$ | Weight maintenance & body recomposition |
| `bulk` | $\text{TDEE} + 300\text{ kcal}$ | Lean muscle gain with minimal fat accumulation |

## 4. Macronutrient Split by Diet Preference
Calorie conversion factors:
- **Protein**: 4 kcal / gram
- **Carbohydrates**: 4 kcal / gram
- **Fat**: 9 kcal / gram

| `diet_preference` | Protein % | Carbs % | Fat % |
| :--- | :--- | :--- | :--- |
| `balanced` | 30% | 40% | 30% |
| `high_protein` | 35% | 40% | 25% |
| `low_carb` | 35% | 25% | 40% |
| `keto` | 30% | 5% | 65% |

- **Daily Fiber Target**: $\text{round}(\text{daily\_calorie\_target} / 1000 \times 14)$ grams (minimum 25g, maximum 45g).
- **Daily Hydration Target**: $\text{round}((\text{weight\_kg} \times 35) + \text{activity\_bonus\_ml})$ rounded to nearest 50 ml (where `activity_bonus_ml` is 0 for sedentary, 250 for light, 500 for moderate, 750 for active, 1000 for very_active).

## 5. Strength & Workout Calculations
- **Set Volume**: $\text{reps} \times \text{weight\_kg}$ (excluding warmup sets where `is_warmup == 1`).
- **Estimated One-Rep Max (Epley Formula)**:
  - For $\text{reps} == 1$: $\text{1RM} = \text{weight\_kg}$
  - For $\text{reps} > 1$: $\text{1RM} = \text{round}\left(\text{weight\_kg} \times \left(1 + \frac{\text{reps}}{30}\right), 1\right)$

## 6. Execution Tools
- Run `python execution/calculate_targets.py --weight 78.5 --height 178 --age 27 --gender male --activity moderate --goal cut --diet high_protein` to compute deterministic targets via CLI.
- Run `python execution/init_db.py --reset` to initialize and seed `server/data/foody.sqlite`.
- Run `python execution/test_api.py` to execute the end-to-end API verification suite.
