import type { JSX } from 'react';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter, Routes, Route, Link } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { Privacy } from './pages/Privacy';
import { Register, SessionDetail, InterviewModes, ResumePage, JobDescriptionPage, Providers, Billing, SecurityPage } from './pages/More';

const qc = new QueryClient();

function Sessions(): JSX.Element { return <div><h2>Sessions</h2><p>History, transcripts, evaluations, and deletion live here.</p></div>; }
function Settings(): JSX.Element {
  const [answerMode, setAnswerMode] = useState('concise');
  return <div><h2>Settings</h2><label>Answer mode <select value={answerMode} onChange={(e) => setAnswerMode(e.target.value)}><option value="concise">Concise</option><option value="detailed">Detailed</option><option value="star">STAR</option><option value="coding">Coding</option><option value="system_design">System Design</option></select></label></div>;
}

export default function App(): JSX.Element {
  return (
    <QueryClientProvider client={qc}>
      <HashRouter>
        <nav aria-label="Main"><Link to="/dashboard">Dashboard</Link> | <Link to="/sessions">Sessions</Link> | <Link to="/interview-modes">Modes</Link> | <Link to="/resume">Resume</Link> | <Link to="/job-description">Jobs</Link> | <Link to="/providers">Providers</Link> | <Link to="/privacy">Privacy</Link> | <Link to="/settings">Settings</Link> | <Link to="/billing">Billing</Link> | <Link to="/security">Security</Link> | <Link to="/login">Sign in</Link> | <Link to="/register">Register</Link></nav>
        <main>
          <h1>AI Interview Assistant</h1>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/sessions" element={<Sessions />} />
            <Route path="/sessions/:id" element={<SessionDetail />} />
            <Route path="/interview-modes" element={<InterviewModes />} />
            <Route path="/resume" element={<ResumePage />} />
            <Route path="/job-description" element={<JobDescriptionPage />} />
            <Route path="/providers" element={<Providers />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/billing" element={<Billing />} />
            <Route path="/security" element={<SecurityPage />} />
          </Routes>
        </main>
      </HashRouter>
    </QueryClientProvider>
  );
}
