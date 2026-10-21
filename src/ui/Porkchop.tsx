import { useState } from 'react';
import { fmtDate } from '../engine/orbit/bodies';
import type { PorkchopCell } from '../engine/orbit/transfer';

interface Props {
  cells: PorkchopCell[];
  cols: number;
  rows: number;
  selected?: { launchDay: number; tofDays: number };
  onPick: (cell: PorkchopCell) => void;
}

const W = 720;
const H = 300;
const M = { top: 24, right: 16, bottom: 30, left: 50 };
const PW = W - M.left - M.right;
const PH = H - M.top - M.bottom;

// Escala secuencial de un solo tono: más brillante = menos Δv (mejor)
const LOW = [157, 184, 255];
const HIGH = [22, 33, 61];
function colorFor(t: number): string {
  const c = LOW.map((l, i) => Math.round(l + (HIGH[i] - l) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Mapa "porkchop": Δv total según fecha de salida (x) y duración del viaje (y) */
export default function Porkchop({ cells, cols, rows, selected, onPick }: Props) {
  const [hover, setHover] = useState<PorkchopCell | null>(null);
  const valid = cells.filter((c) => c.totalDvKms !== null).map((c) => c.totalDvKms!);
  if (valid.length === 0) return null;
  const min = Math.min(...valid);
  const max = Math.min(Math.max(...valid), min * 1.7);

  const l0 = cells[0].launchDay;
  const l1 = cells[cols - 1].launchDay;
  const t0 = cells[0].tofDays;
  const t1 = cells[cells.length - 1].tofDays;
  const x = (d: number) => M.left + ((d - l0) / (l1 - l0)) * PW;
  const y = (t: number) => M.top + (1 - (t - t0) / (t1 - t0)) * PH;
  const cw = PW / (cols - 1);
  const ch = PH / (rows - 1);

  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => l0 + (l1 - l0) * f);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => t0 + (t1 - t0) * f);
  const lunar = t1 < 20;

  return (
    <div className="porkchop">
      <div className="chart-box" onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Mapa porkchop de la ventana de lanzamiento">
          {cells.map((c, i) =>
            c.totalDvKms === null ? null : (
              <rect
                key={i}
                x={x(c.launchDay) - cw / 2}
                y={y(c.tofDays) - ch / 2}
                width={cw + 0.5}
                height={ch + 0.5}
                fill={colorFor(Math.min(1, (c.totalDvKms - min) / (max - min)))}
                onPointerEnter={() => setHover(c)}
                onClick={() => onPick(c)}
                style={{ cursor: 'pointer' }}
              />
            ),
          )}
          {xTicks.map((d) => (
            <text key={d} x={x(d)} y={H - 10} className="axis-label middle">
              {fmtDate(d, lunar ? { day: 'numeric', month: 'short' } : { month: 'short', year: '2-digit' })}
            </text>
          ))}
          {yTicks.map((t) => (
            <text key={t} x={M.left - 6} y={y(t) + 4} className="axis-label end">
              {lunar ? t.toFixed(1) : Math.round(t)}
            </text>
          ))}
          <text x={M.left - 6} y={12} className="axis-label end">
            días de viaje
          </text>
          {selected && (
            <circle cx={x(selected.launchDay)} cy={y(selected.tofDays)} r={7} className="pc-selected" pointerEvents="none" />
          )}
          {hover && (
            <rect
              x={x(hover.launchDay) - cw / 2}
              y={y(hover.tofDays) - ch / 2}
              width={cw}
              height={ch}
              className="pc-hover"
              pointerEvents="none"
            />
          )}
        </svg>
      </div>
      <div className="pc-footer">
        <div className="pc-scale">
          <span>{min.toFixed(1)} km/s</span>
          <i style={{ background: `linear-gradient(90deg, ${colorFor(0)}, ${colorFor(1)})` }} />
          <span>{max.toFixed(1)}+ km/s</span>
        </div>
        <div className="dim">
          {hover?.totalDvKms
            ? `Salida ${fmtDate(hover.launchDay)} · ${lunar ? hover.tofDays.toFixed(1) : Math.round(hover.tofDays)} días · ${hover.totalDvKms.toFixed(2)} km/s`
            : 'Pasa el mouse por el mapa y haz clic para elegir una combinación exacta.'}
        </div>
      </div>
    </div>
  );
}
