/**
 * Small request-validation helpers shared by the API routes.
 * Every helper throws an HttpError (400) so Express' error handler answers
 * with a readable message instead of a database constraint failure (500).
 */

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const IMAGE_DATA_RE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_IMAGE_CHARS = 4_000_000; // ~3 MB of binary once base64-decoded

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function badRequest(message) {
  return new HttpError(400, message);
}

function isValidDateString(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function addDays(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

function daysBetween(fromStr, toStr) {
  const [fy, fm, fd] = fromStr.split('-').map(Number);
  const [ty, tm, td] = toStr.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

function readDate(value, fallback, label = 'date') {
  if (value === undefined || value === null || value === '') return fallback;
  if (!isValidDateString(value)) throw badRequest(`${label} must use the YYYY-MM-DD format`);
  return value;
}

function readNumber(value, { label, min = 0, max = Infinity, fallback, integer = false }) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) throw badRequest(`${label} must be a number`);
  if (n < min || n > max) throw badRequest(`${label} must be between ${min} and ${max}`);
  return integer ? Math.round(n) : n;
}

function readEnum(value, allowed, fallback, label) {
  if (value === undefined || value === null || value === '') return fallback;
  if (!allowed.includes(value)) {
    throw badRequest(`${label} must be one of: ${allowed.join(', ')}`);
  }
  return value;
}

function readText(value, fallback, maxLength) {
  if (value === undefined || value === null) return fallback;
  return String(value).trim().slice(0, maxLength);
}

function readImageData(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > MAX_IMAGE_CHARS || !IMAGE_DATA_RE.test(value)) {
    throw badRequest('image_data must be a JPEG, PNG or WebP data URL under 3 MB');
  }
  return value;
}

module.exports = {
  MEAL_TYPES,
  HttpError,
  badRequest,
  isValidDateString,
  addDays,
  daysBetween,
  readDate,
  readNumber,
  readEnum,
  readText,
  readImageData,
};
