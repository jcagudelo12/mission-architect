import { useState } from 'react';
import {
  alarms,
  createInitialState,
  lessons,
  perform,
  score,
  toggleLoad,
  type ActionView,
  type EmState,
} from '../../engine/emergency/emergency';
import { randomSeed } from '../../engine/rng';
import Cockpit3D from './Cockpit3D';
import { SequenceGame, StarsGame } from './Minigames';
import { ActionsPanel, LogPanel, PowerPanel, StatusPanel, fmtClock } from './panels';
import './emergency.css';

interface Props {
  onExit: () => void;
}

/** Algunos equipos (o navegadores con la aceleración gráfica apagada) no tienen WebGL: ahí usamos la vista 2D */
function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export default function EmergencyScreen({ onExit }: Props) {
  const [seed, setSeed] = useState(randomSeed);
  const [s, setS] = useState<EmState>(() => createInitialState(seed));
  const [webgl] = useState(hasWebGL);
  const [view, setView] = useState<'3d' | '2d'>(webgl ? '3d' : '2d');
  const [briefing, setBriefing] = useState(true);
  const [game, setGame] = useState<ActionView | null>(null);
  const [attempt, setAttempt] = useState(0);

  const restart = (newSeed = seed) => {
    setSeed(newSeed);
    setS(createInitialState(newSeed));
    setGame(null);
    setAttempt(0);
  };

  const onAction = (a: ActionView) => {
    if (a.minigame) setGame(a);
    else setS((prev) => perform(prev, a.id));
  };

  const finishGame = (success: boolean, extraMinutes: number) => {
    if (game) setS((prev) => perform(prev, game.id, { success, extraMinutes }));
    setGame(null);
    setAttempt((n) => n + 1);
  };

  const panels = {
    left: <PowerPanel s={s} onToggle={(id) => setS((prev) => toggleLoad(prev, id))} />,
    center: <StatusPanel s={s} />,
    right: <ActionsPanel s={s} onAction={onAction} />,
    top: <LogPanel s={s} />,
  };

  return (
    <section className="emergency">
      <div className="em-bar">
        <button className="btn ghost small" onClick={onExit}>
          ← Menú
        </button>
        <strong>Emergencia en ruta a Marte</strong>
        <span className="dim">{fmtClock(s.minute)}</span>
        <div className="em-bar-right">
          <button
            className={`btn small ${view === '3d' ? 'primary' : 'ghost'}`}
            onClick={() => setView('3d')}
            disabled={!webgl}
            title={webgl ? undefined : 'Este navegador no tiene WebGL'}
          >
            Cabina 3D
          </button>
          <button className={`btn small ${view === '2d' ? 'primary' : 'ghost'}`} onClick={() => setView('2d')}>
            Vista 2D
          </button>
          <button className="btn ghost small" onClick={() => restart()}>
            Reiniciar
          </button>
        </div>
      </div>

      {view === '3d' ? (
        <div className="em-canvas">
          <Cockpit3D spinDegS={s.spinDegS} alarm={alarms(s).length > 0 && !s.outcome?.won} {...panels} />
          <div className="em-hint">Arrastra para mirar alrededor · los botones de las pantallas funcionan</div>
        </div>
      ) : (
        <div className="em-2d">
          {!webgl && (
            <div className="em-notice">
              Este navegador no tiene WebGL activado, así que la cabina 3D no está disponible. Estás jugando en la vista 2D.
            </div>
          )}
          {panels.top}
          <div className="em-2d-row">
            {panels.left}
            {panels.center}
            {panels.right}
          </div>
        </div>
      )}

      {briefing && (
        <div className="em-modal">
          <div className="mg">
            <h2>Despiertas en la cabina</h2>
            <p>
              Una tormenta solar golpeó la nave en ruta a Marte. La computadora se reinició en modo seguro, la nave gira sin
              control y un ala de paneles solares está dañada. La batería baja minuto a minuto.
            </p>
            <ul className="em-brief">
              <li>Cada procedimiento cuesta tiempo, y mientras tanto se gastan energía, oxígeno y calor.</li>
              <li>Los interruptores del panel eléctrico apagan cargas: ahorras energía, pero algo deja de funcionar.</li>
              <li>Los sistemas dependen unos de otros. El orden en que los arreglas importa.</li>
              <li>
                Ganas si estabilizas la nave, <strong>hablas con Control de Misión</strong> y <strong>corriges el rumbo</strong>.
              </li>
            </ul>
            <div className="mg-foot">
              <span className="dim">Semilla {seed}</span>
              <button className="btn primary" onClick={() => setBriefing(false)}>
                Empezar
              </button>
            </div>
          </div>
        </div>
      )}

      {game && (
        <div className="em-modal">
          {game.minigame === 'sequence' ? (
            <SequenceGame seed={seed + attempt} onDone={finishGame} onCancel={() => setGame(null)} />
          ) : (
            <StarsGame seed={seed + attempt} onDone={finishGame} onCancel={() => setGame(null)} />
          )}
        </div>
      )}

      {s.outcome && (
        <div className="em-modal">
          <div className={`mg em-end ${s.outcome.won ? 'won' : 'lost'}`}>
            <h2>{s.outcome.won ? '¡Emergencia superada!' : 'Misión perdida'}</h2>
            <p>{s.outcome.reason}</p>
            {s.outcome.won && (
              <div className="em-score">
                <strong>{score(s)}</strong> puntos · {fmtClock(s.minute)} · {s.o2Hours.toFixed(1)} h de O₂ ·{' '}
                {s.propellantKg.toFixed(1)} kg de combustible
              </div>
            )}
            <h3>Lecciones de ingeniería</h3>
            <ul>
              {lessons(s).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <div className="mg-foot">
              <button className="btn ghost small" onClick={onExit}>
                Volver al menú
              </button>
              <div>
                <button className="btn ghost small" onClick={() => restart()}>
                  Reintentar
                </button>{' '}
                <button className="btn primary small" onClick={() => restart(randomSeed())}>
                  Otra semilla
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
