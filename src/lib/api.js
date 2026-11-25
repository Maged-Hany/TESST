import { getAuthToken } from './auth.js';

// Thin fetch wrapper: JSON in/out, attaches Bearer session token when signed in,
// and surfaces errors that read like sentences.
export async function api(path, { method = 'GET', body, signal } = {}) {
  const token = getAuthToken();
  const headers = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(path, {
      method,
      signal,
      headers: Object.keys(headers).length ? headers : undefined,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new Error('Can’t reach the Foody server. Check that it is running, then try again.');
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Something went wrong (error ${res.status}).`);
  }
  return data;
}
