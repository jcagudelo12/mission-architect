import { useState } from 'react';
import { ROCKETS } from './data/rockets';
import { randomSeed } from './engine/rng';
import { simulate, type SimResult } from './engine/simulation';
import type { Destination } from './engine/types';
import Design from './screens/Design';
import Launch from './screens/Launch';
import MissionSelect from './screens/MissionSelect';
import Operations from './screens/Operations';
import Results from './screens/Results';

type Screen = 'select' | 'design' | 'launch' | 'ops' | 'results';

const STEPS: { id: Screen; label: string }[] = [
  { id: 'select', label: 'Concepto' },
  { id: 'design', label: 'Diseño' },
  { id: 'launch', label: 'Lanzamiento' },
  { id: 'ops', label: 'Operación' },
  { id: 'results', label: 'Resultados' },
];

export default function App() {
  const [screen, setScreen] = useState<Screen>('select');
  const [dest, setDest] = useState<Destination | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [rocketId, setRocketId] = useState<string | null>(null);
  const [seed, setSeed] = useState(randomSeed);
  const [sim, setSim] = useState<SimResult | null>(null);

  const rocket = ROCKETS.find((r) => r.id === rocketId);
  const stepIndex = STEPS.findIndex((s) => s.id === screen);

  const launch = (s = seed) => {
    if (!dest || !rocket) return;
    setSim(simulate(dest, selection, rocket, s));
    setScreen('ops');
  };

  const newMission = () => {
    setDest(null);
    setSelection([]);
    setRocketId(null);
    setSim(null);
    setScreen('select');
  };

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={newMission} title="Nueva misión">
          <span aria-hidden>🛰️</span> Mission Architect
        </button>
        <ol className="stepper">
          {STEPS.map((s, i) => (
            <li key={s.id} className={i === stepIndex ? 'current' : i < stepIndex ? 'done' : ''}>
              <span className="num">{i + 1}</span> {s.label}
            </li>
          ))}
        </ol>
        {dest && <div className="mission-tag">Misión: {dest.name}</div>}
      </header>

      <main>
        {screen === 'select' && (
          <MissionSelect
            onSelect={(d) => {
              setDest(d);
              setScreen('design');
            }}
          />
        )}
        {screen === 'design' && dest && (
          <Design
            dest={dest}
            selection={selection}
            rocket={rocket}
            onChange={setSelection}
            onBack={() => setScreen('select')}
            onNext={() => setScreen('launch')}
          />
        )}
        {screen === 'launch' && dest && (
          <Launch
            dest={dest}
            selection={selection}
            rocketId={rocketId}
            seed={seed}
            onRocket={setRocketId}
            onSeed={setSeed}
            onBack={() => setScreen('design')}
            onLaunch={() => launch()}
          />
        )}
        {screen === 'ops' && dest && sim && <Operations dest={dest} sim={sim} onFinish={() => setScreen('results')} />}
        {screen === 'results' && dest && sim && (
          <Results
            dest={dest}
            sim={sim}
            onRedesign={() => setScreen('design')}
            onRetry={() => {
              const s = randomSeed();
              setSeed(s);
              launch(s);
            }}
            onNewMission={newMission}
          />
        )}
      </main>
    </div>
  );
}
