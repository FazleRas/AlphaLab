import { supabase } from './supabaseClient';
import API from './config';

// fetch wrapper that attaches the Supabase access token as a bearer, so the
// backend can verify the user's JWT on protected routes. Auth still happens
// via supabase-js on the frontend; all data flows through the FastAPI backend.
export async function authFetch(path, options = {}) {
  let token = null;
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token ?? null;
  }
  const headers = { ...(options.headers || {}) };
  if (options.body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${API}${path}`, { ...options, headers });
}
