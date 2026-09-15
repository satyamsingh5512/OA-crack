import type { JSX } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

export function Dashboard(): JSX.Element {
  const { data, isLoading, isError } = useQuery({ queryKey: ['sessions'], queryFn: () => api.sessions() });
  const sessions = (data ?? []) as { id: string; mode: string; status: string }[];
  return (
    <div>
      <h2>Dashboard</h2>
      <div className="cards">
        <div className="card"><strong>Sessions Completed</strong><span>{sessions.length}</span></div>
        <div className="card"><strong>Questions Answered</strong><span>—</span></div>
        <div className="card"><strong>Avg Response Quality</strong><span>—</span></div>
        <div className="card"><strong>Technical Score</strong><span>—</span></div>
        <div className="card"><strong>Communication Score</strong><span>—</span></div>
        <div className="card"><strong>Confidence Score</strong><span>—</span></div>
      </div>
      {isLoading && <p role="status">Loading sessions…</p>}
      {isError && <p role="alert">Could not load sessions. Is the backend running?</p>}
      {!isLoading && sessions.length === 0 && <p role="status">No sessions yet. Start one from the desktop tray app.</p>}
      <ul>{sessions.map((s) => <li key={s.id}>{s.mode} · {s.status}</li>)}</ul>
    </div>
  );
}
