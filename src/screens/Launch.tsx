import { useMemo } from 'react';
import { ROCKETS } from '../data/rockets';
import { analyzeDesign, rocketCapacityKg } from '../engine/design';
import type { Trajectory } from '../engine/orbit/transfer';
import { randomSeed } from '../engine/rng';
import type { Destination } from '../engine/types';
import BudgetPanel from '../ui/BudgetPanel';

interface Props {
  dest: Destination;
  trajectory: Trajectory;
  selection: string[];
  rocketId: string | null;
  seed: number;
  onRocket: (id: string) => void;
  onSeed: (seed: number) => void;
  onBack: () => void;
  onLaunch: () => void;
}

export default function Launch({ dest, trajectory, selection, rocketId, seed, onRocket, onSeed, onBack, onLaunch }: Props) {
  const rocket = ROCKETS.find((r) => r.id === rocketId);
  const report = useMemo(() => analyzeDesign(dest, selection, trajectory, rocket), [dest, selection, trajectory, rocket]);
  const base = useMemo(() => analyzeDesign(dest, selection, trajectory), [dest, selection, trajectory]);

  return (
    <section className="screen design">
      <div className="catalog">
        <div className="screen-head">
          <h1>Elige el vehículo de lanzamiento</h1>
          <p>
            Tu nave pesa <strong>{Math.round(base.wetMassKg).toLocaleString('es')} kg</strong> con combustible y tu
            trayectoria pide una energía de salida <strong>C3 = {trajectory.c3.toFixed(1)} km²/s²</strong>. Cuanto más
            alto el C3, menos masa puede enviar cada cohete.
          </p>
        </div>
        <div className="parts rockets">
          {ROCKETS.map((r) => {
            const cap = rocketCapacityKg(r, trajectory.c3);
            const fits = base.wetMassKg <= cap;
            const affordable = base.totalCostM + r.costM <= dest.budgetM;
            return (
              <button
                key={r.id}
                className={`part ${r.id === rocketId ? 'selected' : ''} ${fits && affordable ? '' : 'unfit'}`}
                onClick={() => onRocket(r.id)}
                aria-pressed={r.id === rocketId}
              >
                <div className="part-head">
                  <strong>{r.name}</strong>
                  <span className="dim">{r.provider}</span>
                </div>
                <p>{r.description}</p>
                <div className="chips">
                  <span className="chip">${r.costM} M</span>
                  <span className="chip">LEO {r.leoKg.toLocaleString('es')} kg</span>
                  <span className={`chip ${fits ? 'good' : 'bad'}`}>
                    con tu C3: {cap.toLocaleString('es')} kg
                  </span>
                  <span className="chip">éxito {(r.reliability * 100).toFixed(0)} %</span>
                  {!affordable && <span className="chip bad">sin presupuesto</span>}
                </div>
              </button>
            );
          })}
        </div>

        <div className="seed">
          <label>
            Semilla de la simulación{' '}
            <input type="number" value={seed} onChange={(e) => onSeed(Number(e.target.value) || 0)} />
          </label>
          <button className="btn ghost small" onClick={() => onSeed(randomSeed())}>
            🎲 Otra
          </button>
          <span className="dim">La misma semilla con el mismo diseño repite exactamente la misión.</span>
        </div>
      </div>

      <div className="side">
        <BudgetPanel dest={dest} report={report} />
        <div className="actions">
          <button className="btn ghost" onClick={onBack}>
            ← Diseño
          </button>
          <button className="btn primary launch" disabled={!rocket || report.errors.length > 0} onClick={onLaunch}>
            🚀 Lanzar
          </button>
        </div>
      </div>
    </section>
  );
}
