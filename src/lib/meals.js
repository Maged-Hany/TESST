export const MEAL_TYPES = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

export function mealLabel(type) {
  return MEAL_TYPES.find((m) => m.value === type)?.label ?? 'Meal';
}

// Pre-selects the meal time that matches the hour of the day.
export function defaultMealType(date = new Date()) {
  const hour = date.getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}

export const GOAL_LABELS = {
  cut: 'fat loss',
  maintain: 'maintenance',
  bulk: 'muscle gain',
};

export function formatNumber(value) {
  return Math.round(Number(value) || 0).toLocaleString('en-US');
}
