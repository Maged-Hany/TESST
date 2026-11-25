const express = require('express');
const router = express.Router();
const { queryAll } = require('../db');
const { MEAL_TYPES, readEnum, readImageData, readText } = require('../utils/validate');
const { getProfileRow } = require('../middleware/auth');

const PROVIDER_TIMEOUT_MS = 30_000;

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

  if (image_data) {
    contentParts.push({
      type: 'image_url',
      image_url: { url: image_data },
    });
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
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
    throw new Error(`Custom AI provider returned HTTP ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  const rawContent = data?.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new Error('Custom AI provider returned an empty response');
  }

  // Some providers wrap JSON in ```json fences even when asked not to.
  const parsed =
    typeof rawContent === 'string'
      ? JSON.parse(rawContent.replace(/^```(?:json)?\s*|\s*```$/g, ''))
      : rawContent;

  return {
    meal_name: String(parsed.meal_name || meal_name || 'Analyzed Meal').slice(0, 120),
    calories: Math.min(20000, Math.max(0, Math.round(Number(parsed.calories) || 0))),
    protein_g: Math.min(2000, Math.max(0, Number(Number(parsed.protein_g || 0).toFixed(1)))),
    carbs_g: Math.min(2000, Math.max(0, Number(Number(parsed.carbs_g || 0).toFixed(1)))),
    fat_g: Math.min(2000, Math.max(0, Number(Number(parsed.fat_g || 0).toFixed(1)))),
    health_note: String(parsed.health_note || '').slice(0, 400),
    source: 'custom_ai',
  };
}

const FILLER_WORDS = new Set([
  'with', 'and', 'the', 'plate', 'bowl', 'meal', 'fresh', 'cooked', 'homemade', 'small', 'large',
]);

// "eggs" -> "egg", "oats" -> "oat"; leaves "glass"/"hass" alone.
function stem(word) {
  return word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;
}

function wordsOf(text) {
  return String(text).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(stem);
}

/**
 * Whole-word match against the local catalog. A dish that matches several
 * words of one catalog entry ("chicken power bowl") uses that single entry;
 * otherwise each word picks its simplest catalog food ("chicken rice" ->
 * chicken breast + jasmine rice). Substrings never match ("ham" != "graham").
 */
function matchCatalogFoods(cleanName, foods) {
  const tokens = [...new Set(wordsOf(cleanName).filter((t) => t.length >= 3 && !FILLER_WORDS.has(t)))];
  if (tokens.length === 0) return [];

  const indexed = foods.map((food) => ({ food, words: wordsOf(food.name) }));

  const multi = indexed
    .map((entry) => ({ ...entry, hits: tokens.filter((t) => entry.words.includes(t)).length }))
    .filter((entry) => entry.hits >= 2)
    .sort((a, b) => b.hits - a.hits || a.words.length - b.words.length);
  if (multi.length > 0) return [multi[0].food];

  const picked = new Map();
  for (const token of tokens) {
    const best = indexed
      .filter((entry) => entry.words.includes(token))
      .sort((a, b) => a.words.length - b.words.length || a.food.name.localeCompare(b.food.name))[0];
    if (best) picked.set(best.food.id, best.food);
    if (picked.size >= 3) break;
  }
  return [...picked.values()];
}

/**
 * Deterministic fallback estimator used until FOODY_AI_API_KEY is configured
 * (or when the provider is unreachable). It is a rough guide, not a photo
 * analysis, and the response says so via `source: 'local_preview'`.
 */
function buildFallbackEstimate({ meal_name, meal_type, profile }) {
  const cleanName = String(meal_name || '').trim();
  const matched = cleanName ? matchCatalogFoods(cleanName, queryAll('SELECT * FROM foods')) : [];

  let calories;
  let protein_g;
  let carbs_g;
  let fat_g;
  let basis;

  if (matched.length > 0) {
    calories = Math.round(matched.reduce((s, f) => s + Number(f.calories || 0), 0));
    protein_g = Number(matched.reduce((s, f) => s + Number(f.protein_g || 0), 0).toFixed(1));
    carbs_g = Number(matched.reduce((s, f) => s + Number(f.carbs_g || 0), 0).toFixed(1));
    fat_g = Number(matched.reduce((s, f) => s + Number(f.fat_g || 0), 0).toFixed(1));
    basis = `One standard serving of ${matched.map((f) => f.name).join(' + ')}.`;
  } else {
    const defaultsByMeal = {
      breakfast: { calories: 440, protein_g: 28, carbs_g: 48, fat_g: 14 },
      lunch: { calories: 580, protein_g: 44, carbs_g: 56, fat_g: 16 },
      dinner: { calories: 540, protein_g: 42, carbs_g: 46, fat_g: 18 },
      snack: { calories: 220, protein_g: 18, carbs_g: 24, fat_g: 6 },
    };
    ({ calories, protein_g, carbs_g, fat_g } = defaultsByMeal[meal_type]);
    basis = `A typical ${meal_type} portion, because the meal name did not match anything in the food list.`;
  }

  const targetCal = profile?.daily_calorie_target || 2290;
  const sharePct = Math.round((calories / targetCal) * 100);
  const goalText =
    profile?.goal === 'cut' ? 'fat-loss' : profile?.goal === 'bulk' ? 'muscle-gain' : 'maintenance';

  const proteinAdvice =
    matched.length === 0
      ? '.'
      : protein_g >= 30
      ? ', with a strong protein portion for recovery and fullness.'
      : '. Consider pairing it with another protein source to reach your daily target.';
  const health_note =
    `${basis} About ${sharePct}% of your ${targetCal.toLocaleString('en-US')} daily Calories for your ${goalText} goal` +
    proteinAdvice;

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
    const body = req.body || {};
    const image_data = readImageData(body.image_data);
    const meal_name = readText(body.meal_name, '', 120);
    const meal_type = readEnum(body.meal_type, MEAL_TYPES, 'lunch', 'meal_type');
    // Always use the stored profile — the client copy could be stale or tampered with.
    const profile = getProfileRow(req.userId) || {};

    let result = null;
    let notice = '';
    if (process.env.FOODY_AI_API_URL && process.env.FOODY_AI_API_KEY) {
      try {
        result = await callCustomAiProvider({ image_data, meal_name, meal_type, profile });
      } catch (err) {
        console.error('[Foody AI] Provider failed, using local estimate:', err.message);
        notice = 'Photo analysis is unavailable right now, so this is a rough estimate.';
      }
    }

    if (!result) {
      result = buildFallbackEstimate({ meal_name, meal_type, profile });
      if (notice) result.notice = notice;
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = {
  router,
};
