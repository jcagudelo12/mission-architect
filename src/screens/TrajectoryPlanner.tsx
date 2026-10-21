import { useEffect, useMemo, useState } from 'react';
import { BODIES, fmtDate } from '../engine/orbit/bodies';
import {
  ROUTES,
  evaluate,
  findWindows,
  porkchop,
  refine,
  searchSpan,
  type Route,
  type Trajectory,
  type WindowPoint,
} from '../engine/orbit/transfer';
import { useRouteScans } from '../engine/orbit/useRouteScans';
import type { Destination } from '../engine/types';
import OrbitView from '../ui/OrbitView';
import Porkchop from '../ui/Porkchop';
import WindowChart, { ROUTE_COLORS } from '../ui/WindowChart';

interface Props {
  dest: Destination;
  selected: Trajectory | null;
  onSelect: (t: Trajectory) => void;
  onBack: () => void;
  onNext: () => void;
}

const PC_COLS = 56;
const PC_ROWS = 36;

export default function TrajectoryPlanner({ dest, selected, onSelect, onBack, onNext }: Props) {
  const routes = ROUTES[dest.id];
  const scans = useRouteScans(routes);
  const [routeId, setRouteId] = useState(selected?.routeId ?? routes[0].id);
  const route = routes.find((r) => r.id === routeId) ?? routes[0];
  const points = scans[route.id];
  const windows = useMemo(() => (points?.length ? findWindows(route, points) : []), [route, points]);
  const [pcCenter, setPcCenter] = useState<number | null>(selected?.routeId === route.id ? selected.launchDay : null);

  const pick = (r: Route, p: WindowPoint) => {
    const t = refine(r, p);
    if (t) {
      onSelect(t);
      setPcCenter(t.launchDay);
    }
  };

  // Al llegar los cálculos, proponemos la mejor ventana de la ruta (si aún no hay una elegida)
  useEffect(() => {
    if (!points?.length || (selected && selected.routeId === route.id)) return;
    const best = windows.reduce<WindowPoint | null>((b, w) => (!b || w.totalDvKms < b.totalDvKms ? w : b), null);
    if (best) pick(route, best);
  }, [points, route.id]);

  const direct = route.sequence.length === 2;
  const pcHalfSpan = route.central === 'Earth' ? 10 : 110;
  const cells = useMemo(
    () => (direct && pcCenter !== null ? porkchop(route, pcCenter, pcHalfSpan, PC_COLS, PC_ROWS) : []),
    [direct, route, pcCenter, pcHalfSpan],
  );

  const span = searchSpan(route);
  const t = selected && selected.routeId === route.id ? selected : null;

  return (
    <section className="screen">
      <div className="screen-head">
        <h1>Planifica la trayectoria</h1>
        <p>
          Los planetas se mueven: solo en ciertas fechas están bien alineados para viajar barato. Elige una ruta y una
          fecha de salida. Las posiciones de los planetas son reales (efemérides de 2027 a 2036).
        </p>
      </div>

      <div className="route-tabs" role="tablist">
        {routes.map((r, i) => {
          const pts = scans[r.id];
          const best = pts?.length ? Math.min(...pts.map((p) => p.totalDvKms)) : null;
          return (
            <button
              key={r.id}
              role="tab"
              aria-selected={r.id === route.id}
              className={`route-tab ${r.id === route.id ? 'selected' : ''}`}
              onClick={() => setRouteId(r.id)}
            >
              <div className="part-head">
                <strong>
                  <i className="swatch" style={{ background: ROUTE_COLORS[i] }} /> {r.name}
                </strong>
                <span className="dim">{best ? `desde ${best.toFixed(2)} km/s` : 'calculando…'}</span>
              </div>
              <p>{r.description}</p>
              <div className="chips">
                {r.sequence.map((b, k) => (
                  <span key={k} className="chip">
                    {k > 0 && '→ '}
                    {BODIES[b].name}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <div className="traj-grid">
        <div>
          <div className="panel">
            <h3>Ventanas de lanzamiento · Δv total según la fecha de salida</h3>
            <WindowChart
              routes={routes}
              scans={scans}
              span={span}
              activeRouteId={route.id}
              windows={windows}
              selectedLaunch={t?.launchDay}
              onPick={(p) => pick(route, p)}
            />
            {windows.length > 0 && (
              <div className="window-list">
                <span className="dim">Mejores ventanas:</span>
                {windows.map((w) => (
                  <button
                    key={w.launchDay}
                    className={`chip-btn ${t && Math.abs(t.launchDay - w.launchDay) < 15 ? 'selected' : ''}`}
                    onClick={() => pick(route, w)}
                  >
                    {fmtDate(w.launchDay, route.central === 'Earth' ? { day: 'numeric', month: 'short' } : { month: 'short', year: 'numeric' })} ·{' '}
                    {w.totalDvKms.toFixed(1)} km/s
                  </button>
                ))}
              </div>
            )}
          </div>

          {direct && cells.length > 0 && (
            <div className="panel">
              <h3>Mapa porkchop alrededor de la ventana elegida</h3>
              <Porkchop
                cells={cells}
                cols={PC_COLS}
                rows={PC_ROWS}
                selected={t ? { launchDay: t.launchDay, tofDays: t.tofDays } : undefined}
                onPick={(c) => {
                  const tr = evaluate(route, c.launchDay, [c.tofDays]);
                  if (tr) onSelect(tr);
                }}
              />
            </div>
          )}

          <details className="panel explain">
            <summary>¿Qué estoy viendo?</summary>
            <ul>
              <li>
                <strong>Δv total:</strong> el cambio de velocidad que suman el cohete y la nave. Menos Δv = menos
                combustible y un cohete más barato.
              </li>
              <li>
                <strong>C3:</strong> la energía con la que el cohete lanza la nave fuera de la Tierra. Cada cohete puede
                enviar menos masa cuanto más alto es el C3.
              </li>
              <li>
                <strong>Mapa porkchop:</strong> la herramienta clásica de NASA para elegir fechas. Cada punto es una
                combinación de fecha de salida y duración del viaje; las zonas brillantes son las más baratas.
              </li>
              <li>
                <strong>Asistencia gravitatoria:</strong> al pasar cerca de un planeta, su gravedad dobla la trayectoria y
                cambia la velocidad de la nave respecto al Sol sin gastar combustible. Pero el planeta tiene que estar en el
                lugar justo en el momento justo.
              </li>
              <li>
                El modelo usa cónicas empalmadas y el problema de Lambert, igual que el diseño preliminar de misiones
                reales.
              </li>
            </ul>
          </details>
        </div>

        <div className="side">
          <div className="panel">
            <h3>Trayectoria elegida</h3>
            {t ? (
              <>
                <OrbitView dest={dest} traj={t} day={t.launchDay} />
                <TrajectoryStats t={t} dest={dest} />
              </>
            ) : (
              <p className="dim">Elige una fecha en el gráfico de ventanas.</p>
            )}
          </div>
          <div className="actions">
            <button className="btn ghost" onClick={onBack}>
              ← Destino
            </button>
            <button className="btn primary" disabled={!t} onClick={onNext}>
              Diseñar la nave →
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function TrajectoryStats({ t, dest }: { t: Trajectory; dest: Destination }) {
  const short = t.central === 'Earth';
  const dur = short ? `${t.tofDays.toFixed(1)} días` : t.tofDays > 540 ? `${(t.tofDays / 365.25).toFixed(1)} años` : `${Math.round(t.tofDays)} días`;
  return (
    <div className="traj-stats">
      <div className="stat-line">
        <span>Salida</span>
        <strong>{fmtDate(t.launchDay)}</strong>
      </div>
      {t.flybys.map((f) => (
        <div key={f.body + f.day} className="flyby-line">
          <div className="stat-line">
            <span>Sobrevuelo de {BODIES[f.body].name}</span>
            <strong>{fmtDate(f.day)}</strong>
          </div>
          <div className="stat-sub">
            a {Math.round(f.altitudeKm).toLocaleString('es')} km de altura · desvío de {f.turnDeg.toFixed(0)}° ·{' '}
            {f.gainKms >= 0 ? 'gana' : 'pierde'} {Math.abs(f.gainKms).toFixed(2)} km/s respecto al Sol
            {f.dvKms > 0.05 && ` · encendido de ${f.dvKms.toFixed(2)} km/s`}
          </div>
        </div>
      ))}
      <div className="stat-line">
        <span>Llegada a {dest.name}</span>
        <strong>{fmtDate(t.arrivalDay)}</strong>
      </div>
      <div className="stat-line">
        <span>Duración</span>
        <strong>{dur}</strong>
      </div>
      <hr />
      <div className="stat-line" title="Energía que debe dar el cohete">
        <span>C3 de lanzamiento</span>
        <strong>{t.c3.toFixed(1)} km²/s²</strong>
      </div>
      <div className="stat-line">
        <span>Δv del cohete (salida)</span>
        <strong>{t.departureDvKms.toFixed(2)} km/s</strong>
      </div>
      <div className="stat-line">
        <span>Velocidad al llegar (v∞)</span>
        <strong>{t.arrivalVinfKms.toFixed(2)} km/s</strong>
      </div>
      <div className="stat-line">
        <span>Δv de la nave</span>
        <strong>{t.spacecraftDvKms.toFixed(2)} km/s</strong>
      </div>
      <div className="stat-line total">
        <span>Δv total</span>
        <strong>{t.totalDvKms.toFixed(2)} km/s</strong>
      </div>
    </div>
  );
}
