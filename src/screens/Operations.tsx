import { useEffect, useRef, useState } from 'react';
import { fmtMb } from '../engine/design';
import type { SimResult } from '../engine/simulation';
import type { Destination } from '../engine/types';
import Meter from '../ui/Meter';
import OrbitView from '../ui/OrbitView';

interface Props {
  dest: Destination;
  sim: SimResult;
  onFinish: () => void;
}

/** Segundos que dura la animación completa a velocidad 1× */
const BASE_DURATION_S = 25;
const SPEEDS = [1, 3, 10];

const PHASE_LABEL = { launch: 'Lanzamiento', cruise: 'Crucero', ops: 'Operación científica' };

export default function Operations({ dest, sim, onFinish }: Props) {
  const [day, setDay] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const last = useRef<number | null>(null);
  const done = day >= sim.endDay;

  useEffect(() => {
    if (paused || done) {
      last.current = null;
      return;
    }
    let raf = 0;
    const tick = (t: number) => {
      const dt = last.current === null ? 0 : (t - last.current) / 1000;
      last.current = t;
      setDay((d) => Math.min(sim.endDay, d + (dt * speed * sim.totalDays) / BASE_DURATION_S));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, done, speed, sim]);

  const today = Math.floor(day);
  const sample = [...sim.samples].reverse().find((s) => s.day <= today);
  const events = sim.events.filter((e) => e.day <= today).reverse();
  const phase = today === 0 ? 'launch' : today <= sim.cruiseDays ? 'cruise' : 'ops';
  const lost = done && !!sim.lostReason;

  return (
    <section className="screen ops">
      <div className="ops-main">
        <div className="ops-head">
          <div>
            <div className="dim">{PHASE_LABEL[phase]}</div>
            <h1>
              Día {today.toLocaleString('es')} <span className="dim">/ {sim.totalDays.toLocaleString('es')}</span>
            </h1>
          </div>
          <div className="controls">
            <button className="btn ghost small" onClick={() => setPaused((p) => !p)} disabled={done}>
              {paused ? '▶ Reanudar' : '⏸ Pausa'}
            </button>
            {SPEEDS.map((s) => (
              <button key={s} className={`btn small ${s === speed ? 'primary' : 'ghost'}`} onClick={() => setSpeed(s)}>
                {s}×
              </button>
            ))}
            <button className="btn ghost small" onClick={() => setDay(sim.endDay)} disabled={done}>
              ⏭ Saltar
            </button>
          </div>
        </div>
        <div className="progress">
          <div className="progress-cruise" style={{ width: `${(sim.cruiseDays / sim.totalDays) * 100}%` }} />
          <div className="progress-now" style={{ left: `${(day / sim.totalDays) * 100}%` }} />
        </div>
        <OrbitView dest={dest} day={day} cruiseDays={sim.cruiseDays} lost={lost} />
        {done && (
          <div className={`banner ${sim.lostReason ? 'bad' : 'ok'}`}>
            {sim.lostReason ?? 'Misión completada.'}
            <button className="btn primary" onClick={onFinish}>
              Ver resultados →
            </button>
          </div>
        )}
      </div>

      <div className="side">
        <div className="panel">
          <h3>Telemetría</h3>
          <Meter label="Energía" value={sample?.powerUseW ?? 0} max={sample?.powerGenW ?? 0} unit="W" hint="Consumo / generación" />
          <div className="stat-line">
            <span>Instrumentos activos</span>
            <strong>
              {sample?.activeInstruments ?? 0} / {sim.report.instruments.length}
            </strong>
          </div>
          <div className="stat-line">
            <span>Datos enviados hoy</span>
            <strong>{fmtMb(sample?.downlinkMb ?? 0)}</strong>
          </div>
          <Meter label="Ciencia acumulada" value={sample?.science ?? 0} max={dest.scienceTarget} unit="pts" mode="over" />
        </div>
        <div className="panel log">
          <h3>Bitácora</h3>
          <ul>
            {events.map((e, i) => (
              <li key={`${e.day}-${i}`} className={e.kind}>
                <span className="log-day">D{e.day}</span> {e.text}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
