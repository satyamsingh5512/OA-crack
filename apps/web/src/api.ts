const API = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3001';
let token: string | null = null;
export function setToken(t: string | null): void { token = t; }
export function getToken(): string | null { return token; }
async function req(path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}
export const api = {
  register: (email: string, password: string) => req('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }) as Promise<{ accessToken: string; refreshToken: string }>,
  login: (email: string, password: string) => req('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }) as Promise<{ accessToken: string; refreshToken: string }>,
  sessions: () => req('/sessions') as Promise<unknown[]>,
  createSession: (mode: string) => req('/sessions', { method: 'POST', body: JSON.stringify({ mode }) }),
  endSession: (id: string) => req(`/sessions/${id}/end`, { method: 'POST' }),
  deleteSession: (id: string) => req(`/sessions/${id}`, { method: 'DELETE' }),
  uploadResume: (filename: string, text: string) => req('/resume/upload', { method: 'POST', body: JSON.stringify({ filename, text }) }),
  saveJd: (title: string, content: string) => req('/job-descriptions', { method: 'POST', body: JSON.stringify({ title, content }) }),
  evaluate: (question: string, answer: string) => req('/ai/evaluate', { method: 'POST', body: JSON.stringify({ question, answer }) }),
  summarize: (transcript: string) => req('/ai/summarize', { method: 'POST', body: JSON.stringify({ transcript }) }),
};
