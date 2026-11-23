const express = require('express');
const router = express.Router();
const { queryAll, queryOne } = require('../db');

/**
 * Pluggable Custom AI Vision Provider
 * Configure FOODY_AI_API_URL, FOODY_AI_API_KEY, and FOODY_AI_MODEL in .env
 * whenever you are ready to connect your custom AI provider.
 */
async function callCustomAiProvider({ image_data, meal_name, meal_type, profile }) {
  const apiUrl = process.env.FOODY_AI_API_URL;
  const apiKey = process.env.FOODY_AI_API_KEY;
  const model = process.env.FOODY_AI_MODEL || 'gpt-4o-mini';

  if (!apiUrl || !apiKey) {
    return null;
  }

  const systemPrompt = [
    'You are Foody, a concise nutrition analyst.',
    'Estimate total calories, protein_g, carbs_g, and fat_g for the meal photo and meal name.',
    'Also write one short, practical health_note tailored to the user profile.',
    'Respond strictly with valid JSON containing keys: meal_name, calories, protein_g, carbs_g, fat_g, health_note.',
  ].join(' ');

  const userProfileSummary = [
    `Weight: ${profile.weight_kg} kg`,
    `Height: ${profile.height_cm} cm`,
    `Age: ${profile.age}`,
    `Gender: ${profile.gender}`,
    `Activity: ${profile.activity_level}`,
    `Goal: ${profile.goal}`,
    `Daily Calorie Target: ${profile.daily_calorie_target} kcal`,
    profile.health_notes ? `Health Notes/Allergies: ${profile.health_notes}` : '',
  ]
    .filter(Boolean)
    .join(', ');

  const contentParts = [
    {
      type: 'text',
      text: `Meal name: "${meal_name || 'Unknown meal'}". Meal time: ${meal_type}. User profile: ${userProfileSummary}. Return JSON only.`,
    },
  ];

  if (image_data && String(image_data).startsWith('data:image/')) {
    contentParts.push({
      type: 'image_url',
      image_url: { url: image_data },
    });
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contentParts },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 400,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Custom AI provider returned HTTP ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const rawContent = data?.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new Error('Custom AI provider returned an empty response');
  }

  const parsed = typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent;
  return {
    meal_name: parsed.meal_name || meal_name || 'Analyzed Meal',
    calories: Math.max(0, Math.round(Number(parsed.calories) || 0)),
    protein_g: Math.max(0, Number(Number(parsed.protein_g || 0).toFixed(1))),
    carbs_g: Math.max(0, Number(Number(parsed.carbs_g || 0).toFixed(1))),
    fat_g: Math.max(0, Number(Number(parsed.fat_g || 0).toFixed(1))),
    health_note: parsed.health_note || '',
    source: 'custom_ai',
  };
}

/**
 * Deterministic fallback estimator used until FOODY_AI_API_KEY is configured.
 * Matches keywords against Foody's local SQLite foods catalog and generates
 * personalized guidance using the user's weight, height, age, and goal.
 */
function buildFallbackEstimate({ meal_name, meal_type, profile }) {
  const cleanName = String(meal_name || '').trim();
  const foods = queryAll('SELECT * FROM foods');

  let matched = [];
  if (cleanName) {
    const tokens = cleanName
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && !['with', 'and', 'the', 'plate', 'bowl', 'meal'].includes(t));

    if (tokens.length > 0) {
      for (const food of foods) {
        const fname = food.name.toLowerCase();
        if (tokens.some((tok) => fname.includes(tok))) {
          matched.push(food);
          if (matched.length >= 3) break;
        }
      }
    }
  }

  let calories;
  let protein_g;
  let carbs_g;
  let fat_g;

  if (matched.length > 0) {
    calories = Math.round(matched.reduce((s, f) => s + Number(f.calories || 0), 0));
    protein_g = Number(matched.reduce((s, f) => s + Number(f.protein_g || 0), 0).toFixed(1));
    carbs_g = Number(matched.reduce((s, f) => s + Number(f.carbs_g || 0), 0).toFixed(1));
    fat_g = Number(matched.reduce((s, f) => s + Number(f.fat_g || 0), 0).toFixed(1));
  } else {
    const defaultsByMeal = {
      breakfast: { calories: 440, protein_g: 28, carbs_g: 48, fat_g: 14 },
      lunch: { calories: 580, protein_g: 44, carbs_g: 56, fat_g: 16 },
      dinner: { calories: 540, protein_g: 42, carbs_g: 46, fat_g: 18 },
      snack: { calories: 220, protein_g: 18, carbs_g: 24, fat_g: 6 },
    };
    const preset = defaultsByMeal[meal_type] || defaultsByMeal.lunch;
    ({ calories, protein_g, carbs_g, fat_g } = preset);
  }

  const targetCal = profile?.daily_calorie_target || 2290;
  const sharePct = Math.round((calories / targetCal) * 100);
  const goalText =
    profile?.goal === 'cut'
      ? 'fat-loss'
      : profile?.goal === 'bulk'
      ? 'muscle-gain'
      : 'maintenance';

  const health_note =
    `Estimated at ${sharePct}% of your ${targetCal.toLocaleString()} daily Calories for your ${goalText} goal` +
    (protein_g >= 30
      ? ' — strong protein portion to support recovery and satiety.'
      : ' — consider pairing with an extra protein source to hit your daily target.');

  return {
    meal_name: cleanName || `${meal_type.charAt(0).toUpperCase() + meal_type.slice(1)} Meal`,
    calories,
    protein_g,
    carbs_g,
    fat_g,
    health_note,
    source: 'local_preview',
  };
}

// POST /api/ai/analyze-meal
router.post('/ai/analyze-meal', async (req, res, next) => {
  try {
    const { image_data = '', meal_name = '', meal_type = 'lunch' } = req.body || {};
    const profile = queryOne('SELECT * FROM user_profile WHERE id = 1') || {};
    const mergedProfile = { ...profile, ...(req.body?.profile || {}) };

    let result = null;
    if (process.env.FOODY_AI_API_URL && process.env.FOODY_AI_API_KEY) {
      result = await callCustomAiProvider({
        image_data,
        meal_name,
        meal_type,
        profile: mergedProfile,
      });
    }

    if (!result) {
      result = buildFallbackEstimate({
        meal_name,
        meal_type,
        profile: mergedProfile,
      });
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = {
  router,
};
