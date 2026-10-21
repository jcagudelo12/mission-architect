import { useState } from 'react';
import { fmtDate } from '../engine/orbit/bodies';
import type { Route, WindowPoint } from '../engine/orbit/transfer';

/** Colores de las rutas en orden fijo (validados contra la superficie oscura) */
export const ROUTE_COLORS = ['#5b8cff', '#c97a1f'];

interface Props {
  routes: Route[];
  scans: Record<string, WindowPoint[] | undefined>;
  span: [number, number];
  activeRouteId: string;
  windows: WindowPoint[];
  selectedLaunch?: number;
  onPick: (point: WindowPoint) => void;
}

const W = 720;
const H = 230;
const M = { top: 24, right: 16, bottom: 28, left: 44 };
const PW = W - M.left - M.right;
const PH = H - M.top - M.bottom;

/** Costo mínimo (Δv total) según la fecha de lanzamiento: los valles son las ventanas */
export default function WindowChart({ routes, scans, span, activeRouteId, windows, selectedLaunch, onPick }: Props) {
  const [hoverDay, setHoverDay] = useState<number | null>(null);
  const all = routes.flatMap((r) => scans[r.id] ?? []);
  if (all.length === 0) return <div className="chart-loading">Calculando trayectorias para miles de fechas…</div>;

  const minDv = Math.min(...all.map((p) => p.totalDvKms));
  const yMin = Math.floor(minDv * 0.95 * 2) / 2;
  const yMax = Math.ceil(Math.min(Math.max(...all.map((p) => p.totalDvKms)), minDv * 1.8) * 2) / 2;
  const x = (d: number) => M.left + ((d - span[0]) / (span[1] - span[0])) * PW;
  const y = (v: number) => M.top + (1 - (Math.min(v, yMax) - yMin) / (yMax - yMin)) * PH;
  const dayAt = (px: number) => span[0] + ((px - M.left) / PW) * (span[1] - span[0]);

  const lunar = span[1] - span[0] < 120;
  const ticks: number[] = [];
  if (lunar) {
    for (let d = Math.ceil(span[0]); d <= span[1]; d += 7) ticks.push(d);
  } else {
    const startYear = new Date(Date.UTC(2000, 0, 1, 12) + span[0] * 86_400_000).getUTCFullYear() + 1;
    for (let yr = startYear; ; yr++) {
      const d = (Date.UTC(yr, 0, 1) - Date.UTC(2000, 0, 1, 12)) / 86_400_000;
      if (d > span[1]) break;
      ticks.push(d);
    }
  }
  const yTicks: number[] = [];
  const yStep = yMax - yMin > 4 ? 1 : 0.5;
  for (let v = yMin; v <= yMax + 1e-9; v += yStep) yTicks.push(v);

  const nearest = (pts: WindowPoint[], d: number) =>
    pts.reduce((best, p) => (Math.abs(p.launchDay - d) < Math.abs(best.launchDay - d) ? p : best), pts[0]);

  const handleMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    setHoverDay(dayAt(((e.clientX - rect.left) / rect.width) * W));
  };
  const handleClick = () => {
    const pts = scans[activeRouteId];
    if (hoverDay !== null && pts?.length) onPick(nearest(pts, hoverDay));
  };

  const hover = hoverDay === null ? null : routes.map((r) => ({ route: r, p: scans[r.id]?.length ? nearest(scans[r.id]!, hoverDay) : null }));
  const tooltipLeft = hoverDay !== null && x(hoverDay) > W * 0.65;

  return (
    <div className="window-chart">
      <div className="legend">
        {routes.map((r, i) => (
          <span key={r.id} className={r.id === activeRouteId ? 'active' : ''}>
            <i style={{ background: ROUTE_COLORS[i] }} />
            {r.name}
            {!scans[r.id] && <em> (calculando…)</em>}
          </span>
        ))}
        <span className="dim">Más abajo = menos energía</span>
      </div>
      <div className="chart-box">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Δv total según la fecha de lanzamiento">
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} className="grid" />
              <text x={M.left - 6} y={y(v) + 4} className="axis-label end">
                {v.toFixed(yStep < 1 ? 1 : 0)}
              </text>
            </g>
          ))}
          {ticks.map((d) => (
            <text key={d} x={x(d)} y={H - 8} className="axis-label middle">
              {lunar ? fmtDate(d, { day: 'numeric', month: 'short' }) : fmtDate(d, { year: 'numeric' })}
            </text>
          ))}
          <text x={M.left - 6} y={10} className="axis-label end">
            Δv km/s
          </text>

          {routes.map((r, i) => {
            const pts = scans[r.id];
            if (!pts?.length) return null;
            // Cortamos la línea donde no existe ninguna trayectoria posible
            const gap = (span[1] - span[0]) / 100;
            // y también donde el costo se sale del gráfico, para no dibujar una meseta falsa en el borde
            let d = '';
            pts.forEach((p, k) => {
              if (p.totalDvKms > yMax) return;
              const prev = pts[k - 1];
              const join = prev && prev.totalDvKms <= yMax && p.launchDay - prev.launchDay <= gap;
              d += `${join ? 'L' : 'M'}${x(p.launchDay).toFixed(1)},${y(p.totalDvKms).toFixed(1)} `;
            });
            return <path key={r.id} d={d} className={`series ${r.id === activeRouteId ? 'active' : ''}`} stroke={ROUTE_COLORS[i]} />;
          })}

          {selectedLaunch !== undefined && (
            <line x1={x(selectedLaunch)} x2={x(selectedLaunch)} y1={M.top} y2={M.top + PH} className="selected-line" />
          )}
          {windows.map((w) => (
            <circle
              key={w.launchDay}
              cx={x(w.launchDay)}
              cy={y(w.totalDvKms)}
              r={5}
              className="window-dot"
              stroke={ROUTE_COLORS[routes.findIndex((r) => r.id === activeRouteId)]}
            />
          ))}

          {hover && hoverDay !== null && (
            <g pointerEvents="none">
              <line x1={x(hoverDay)} x2={x(hoverDay)} y1={M.top} y2={M.top + PH} className="crosshair" />
              {hover.map(({ route, p }, i) =>
                p ? <circle key={route.id} cx={x(p.launchDay)} cy={y(p.totalDvKms)} r={4} fill={ROUTE_COLORS[i]} className="hover-dot" /> : null,
              )}
            </g>
          )}
          <rect
            x={M.left}
            y={M.top}
            width={PW}
            height={PH}
            fill="transparent"
            style={{ cursor: 'crosshair' }}
            onPointerMove={handleMove}
            onPointerLeave={() => setHoverDay(null)}
            onClick={handleClick}
          />
        </svg>
        {hover && hoverDay !== null && (
          <div
            className="tooltip"
            style={{
              left: tooltipLeft ? undefined : `${(x(hoverDay) / W) * 100 + 1.5}%`,
              right: tooltipLeft ? `${100 - (x(hoverDay) / W) * 100 + 1.5}%` : undefined,
            }}
          >
            <strong>Salida {fmtDate(hoverDay)}</strong>
            {hover.map(({ route, p }, i) =>
              p ? (
                <div key={route.id}>
                  <i style={{ background: ROUTE_COLORS[i] }} />
                  {route.name}: {p.totalDvKms.toFixed(2)} km/s · C3 {p.c3.toFixed(0)}
                </div>
              ) : null,
            )}
            <span className="dim">Clic para elegir esta fecha</span>
          </div>
        )}
      </div>
    </div>
  );
}
