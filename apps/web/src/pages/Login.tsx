import type { JSX } from 'react';
import { useState } from 'react';
import { api, setToken } from '../api';

export function Login(): JSX.Element {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault(); setError(null);
    try { const r = await api.login(email, password); setToken(r.accessToken); location.hash = '#/dashboard'; }
    catch (err) { setError(err instanceof Error ? err.message : 'Login failed'); }
  }
  return (
    <form onSubmit={submit} aria-label="Login">
      <h2>Sign in</h2>
      {error && <p role="alert">{error}</p>}
      <label>Email <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label>Password <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      <button type="submit">Sign in</button>
    </form>
  );
}
