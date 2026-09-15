import { useState } from 'react';
import type { JSX } from 'react';
import { api, setToken } from '../api';

export function Register(): JSX.Element {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault(); setError(null);
    try { const r = await api.register(email, password); setToken(r.accessToken); setDone(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'Registration failed'); }
  }
  return (
    <form onSubmit={submit} aria-label="Register">
      <h2>Create account</h2>
      {error && <p role="alert">{error}</p>}
      {done && <p role="status">Account created and signed in.</p>}
      <label>Email <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label>Password <input type="password" value={password} minLength={8} onChange={(e) => setPassword(e.target.value)} required /></label>
      <button type="submit">Register</button>
    </form>
  );
}

export function SessionDetail(): JSX.Element {
  return <div><h2>Session</h2><p>Transcript segments, detected questions, answers, and the evaluation report appear here after a session ends.</p></div>;
}

export function InterviewModes(): JSX.Element {
  const modes = ['Mock Interview', 'Practice Coding', 'Behavioral', 'Technical', 'Accessibility Assistance'];
  return <div><h2>Interview modes</h2><ul>{modes.map((m) => <li key={m}>{m}</li>)}</ul></div>;
}

export function ResumePage(): JSX.Element {
  const [text, setText] = useState(''); const [msg, setMsg] = useState<string | null>(null);
  async function upload(): Promise<void> {
    setMsg(null);
    try { await api.uploadResume('resume.txt', text); setMsg('Resume uploaded and parsed.'); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Upload failed'); }
  }
  return (
    <div><h2>Resume</h2>
      <label>Paste resume text <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} /></label>
      <button onClick={upload}>Upload & parse</button>
      {msg && <p role="status">{msg}</p>}
    </div>
  );
}

export function JobDescriptionPage(): JSX.Element {
  const [title, setTitle] = useState(''); const [content, setContent] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  async function save(): Promise<void> {
    try { await api.saveJd(title, content); setMsg('Job description saved.'); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Save failed'); }
  }
  return (
    <div><h2>Job description</h2>
      <label>Title <input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label>Content <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={8} /></label>
      <button onClick={save}>Save</button>
      {msg && <p role="status">{msg}</p>}
    </div>
  );
}

export function Providers(): JSX.Element {
  return <div><h2>AI providers</h2><p>Configure providers via environment on the backend; keys are stored encrypted and never leave the server. Desktop keys are held in the main process via OS keychain (safeStorage).</p></div>;
}

export function Billing(): JSX.Element {
  return <div><h2>Billing</h2><p>No plan selected. Usage (AI tokens, transcription minutes) is metered per account for future invoicing.</p></div>;
}

export function SecurityPage(): JSX.Element {
  return <div><h2>Security</h2><p>Short-lived access tokens with refresh rotation, Argon2id hashing, audit logging, data export, and full account deletion are built in.</p></div>;
}
