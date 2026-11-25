// Dates are handled as local "YYYY-MM-DD" strings so a day never shifts
// because of the time zone (the API stores the same format).

export function toDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateString(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function shiftDate(dateStr, deltaDays) {
  const dt = parseDateString(dateStr);
  dt.setDate(dt.getDate() + deltaDays);
  return toDateString(dt);
}

export function formatShort(dateStr) {
  return parseDateString(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatDayLabel(dateStr, today = toDateString()) {
  if (dateStr === today) return 'Today';
  if (dateStr === shiftDate(today, -1)) return 'Yesterday';
  return parseDateString(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function formatLongDate(dateStr) {
  return parseDateString(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function weekdayShort(dateStr) {
  return parseDateString(dateStr).toLocaleDateString('en-US', { weekday: 'short' });
}

export function dayOfMonth(dateStr) {
  return parseDateString(dateStr).getDate();
}
