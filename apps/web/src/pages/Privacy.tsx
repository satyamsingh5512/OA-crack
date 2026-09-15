import type { JSX } from 'react';
import { useState } from 'react';

const TOGGLES = ['Microphone', 'System Audio', 'Screen Capture', 'Cloud Transcription', 'Cloud AI', 'Session Recording'];

export function Privacy(): JSX.Element {
  const [state, setState] = useState<Record<string, boolean>>({ Microphone: true, 'Cloud AI': true, 'Cloud Transcription': true });
  return (
    <div>
      <h2>Privacy Center</h2>
      <p>Defaults to minimal retention. Raw audio is never stored unless Session Recording is on.</p>
      {TOGGLES.map((t) => (
        <label key={t}><input type="checkbox" checked={!!state[t]} onChange={(e) => setState({ ...state, [t]: e.target.checked })} /> {t}: {state[t] ? 'ON' : 'OFF'}</label>
      ))}
      <div className="row">
        <button>Delete session</button><button>Delete transcript</button><button>Delete recordings</button><button>Export data</button><button>Delete account data</button>
      </div>
    </div>
  );
}
