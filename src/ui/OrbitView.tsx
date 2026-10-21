import { useMemo } from 'react';
import { AU_KM, BODIES, fmtDate, helioState, moonState, type BodyId } from '../engine/orbit/bodies';
import { eventWindowDays, samplePath, shipPosition, type Trajectory } from '../engine/orbit/transfer';
import type { Vec } from '../engine/orbit/vec';
import type { Destination } from '../engine/types';

interface Props {
  dest: Destination;
  traj: Trajectory;
  /** Fecha actual en días desde J2000 */
  day: number;
  /** true cuando la nave ya está en órbita del destino */
  inOrbit?: boolean;
  lost?: boolean;
}

const SIZE = 420;
const C = SIZE / 2;
const R_MAX_PX = 190;
const PERIOD_DAYS: Record<BodyId, number> = { Venus: 224.7, Earth: 365.25, Moon: 27.32, Mars: 687, Jupiter: 4332.6 };

/**
 * Vista en el plano de la eclíptica con posiciones reales de los planetas.
 * Para Júpiter se comprime la escala radial (raíz cuadrada) para que la Tierra siga siendo visible.
 */
export default function OrbitView({ dest, traj, day, inOrbit = false, lost = false }: Props) {
  const geo = traj.central === 'Earth';
  const bodies = useMemo(
    () => (geo ? (['Moon'] as BodyId[]) : Array.from(new Set<BodyId>(['Earth', ...traj.sequence]))),
    [geo, traj],
  );
  const stateOf = (b: BodyId, d: number) => (geo ? moonState(d) : helioState(b, d));

  const { orbits, path, project } = useMemo(() => {
    const unit = geo ? 1 : AU_KM;
    const orbits = bodies.map((b) => ({
      body: b,
      points: Array.from({ length: 121 }, (_, i) => stateOf(b, traj.launchDay + (PERIOD_DAYS[b] * i) / 120).r),
    }));
    const path = samplePath(traj);
    const all = [...orbits.flatMap((o) => o.points), ...path];
    const rMax = (Math.max(...all.map((p) => Math.hypot(p[0], p[1]))) / unit) * 1.04;
    const exponent = rMax > 3 ? 0.5 : 1;
    const project = (v: Vec): [number, number] => {
      const r = Math.hypot(v[0], v[1]) / unit;
      const th = Math.atan2(v[1], v[0]);
      const rr = R_MAX_PX * (r / rMax) ** exponent;
      return [C + rr * Math.cos(th), C - rr * Math.sin(th)];
    };
    return { orbits, path, project };
  }, [traj, bodies]);

  const toD = (pts: Vec[]) =>
    pts
      .map(project)
      .map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`)
      .join(' ');

  const clamped = Math.min(Math.max(day, traj.launchDay), traj.arrivalDay);
  const travelled = path.slice(0, Math.max(1, Math.ceil(((clamped - traj.launchDay) / traj.tofDays) * (path.length - 1)) + 1));

  const [dx, dy] = project(stateOf(dest.body, day).r);
  let ship: [number, number];
  if (inOrbit) {
    const ang = (day - traj.arrivalDay) * (geo ? 6 : 1.7);
    ship = [dx + 13 * Math.cos(ang), dy - 13 * Math.sin(ang)];
  } else {
    ship = project(shipPosition(traj, clamped));
  }

  // Marcas de los eventos: dónde ocurren los sobrevuelos y la llegada
  const markers = [
    ...traj.flybys.map((f) => ({ day: f.day, body: f.body, label: `${BODIES[f.body].name} · ${fmtDate(f.day, { month: 'short', year: 'numeric' })}` })),
    { day: traj.arrivalDay, body: dest.body, label: `Llegada · ${fmtDate(traj.arrivalDay, { month: 'short', year: 'numeric' })}` },
  ];

  const inset = activeInset(traj, dest, day, lost);

  return (
    <svg className="orbit-view" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Trayectoria de la misión">
      <defs>
        <radialGradient id="sun" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff6c8" />
          <stop offset="60%" stopColor="#ffc845" />
          <stop offset="100%" stopColor="#ff9a1f" stopOpacity="0" />
        </radialGradient>
        <clipPath id="inset-clip">
          <rect x={INSET.x} y={INSET.y} width={INSET.size} height={INSET.size} rx={10} />
        </clipPath>
      </defs>

      {orbits.map((o) => (
        <path key={o.body} d={toD(o.points)} className="orbit-ring" />
      ))}
      <path d={toD(path)} className="transfer" />
      <path d={toD(travelled)} className="travelled" />

      {markers.map((m) => {
        const [x, y] = project(stateOf(m.body, m.day).r);
        return (
          <g key={m.label}>
            <circle cx={x} cy={y} r={9} className="event-marker" />
            <text x={x} y={y + 20} className="orbit-label small">
              {m.label}
            </text>
          </g>
        );
      })}

      {geo ? (
        <>
          <circle cx={C} cy={C} r={10} fill={BODIES.Earth.color} />
          <text x={C} y={C + 24} className="orbit-label">
            Tierra
          </text>
        </>
      ) : (
        <circle cx={C} cy={C} r={16} fill="url(#sun)" />
      )}
      {bodies.map((b) => {
        const [x, y] = project(stateOf(b, day).r);
        return (
          <g key={b}>
            <circle cx={x} cy={y} r={b === 'Jupiter' ? 9 : b === 'Moon' ? 5 : 6} fill={BODIES[b].color} />
            <text x={x} y={y - 12} className="orbit-label">
              {BODIES[b].name}
            </text>
          </g>
        );
      })}

      <g transform={`translate(${ship[0]},${ship[1]})`} className={lost ? 'ship lost' : 'ship'}>
        <rect x={-3} y={-3} width={6} height={6} />
        <line x1={-8} y1={0} x2={8} y2={0} />
      </g>

      {inset && <Inset {...inset} />}
    </svg>
  );
}

// --- Recuadro ampliado: sobrevuelo o inserción orbital ---

const INSET = { x: SIZE - 186, y: 8, size: 178 };

interface InsetProps {
  body: BodyId;
  kind: 'flyby' | 'arrival';
  /** Avance dentro del evento, de 0 a 1 */
  u: number;
  altitudeKm: number;
  ecc: number;
  sense: 1 | -1;
  inAngle: number;
  title: string;
  detail: string;
}

function activeInset(traj: Trajectory, dest: Destination, day: number, lost: boolean): InsetProps | null {
  const w = eventWindowDays(traj);
  for (const f of traj.flybys) {
    if (Math.abs(day - f.day) < w) {
      return {
        body: f.body,
        kind: 'flyby',
        u: (day - f.day + w) / (2 * w),
        altitudeKm: f.altitudeKm,
        ecc: 1 / Math.sin((f.turnDeg * Math.PI) / 360),
        sense: f.sense,
        inAngle: f.inAngle,
        title: `Sobrevuelo de ${BODIES[f.body].name}`,
        detail: `${Math.round(f.altitudeKm).toLocaleString('es')} km · giro ${f.turnDeg.toFixed(0)}° · ${f.gainKms >= 0 ? '+' : ''}${f.gainKms.toFixed(1)} km/s`,
      };
    }
  }
  if (Math.abs(day - traj.arrivalDay) < w) {
    const b = BODIES[dest.body];
    const rp = b.radiusKm + b.captureAltKm;
    return {
      body: dest.body,
      // Si la nave se perdió al llegar, no hubo captura: sigue de largo por la hipérbola
      kind: lost ? 'flyby' : 'arrival',
      u: (day - traj.arrivalDay + w) / (2 * w),
      altitudeKm: b.captureAltKm,
      ecc: 1 + (rp * traj.arrivalVinfKms ** 2) / b.mu,
      sense: 1,
      inAngle: traj.arrivalAngle,
      title: lost ? `${b.name}: sin frenar` : `Inserción orbital: ${b.name}`,
      detail: lost
        ? `llega a ${traj.arrivalVinfKms.toFixed(1)} km/s y sigue de largo`
        : `llega a ${traj.arrivalVinfKms.toFixed(1)} km/s · frena ${traj.insertionDvKms.toFixed(2)} km/s`,
    };
  }
  return null;
}

function Inset({ body, kind, u, altitudeKm, ecc, sense, inAngle, title, detail }: InsetProps) {
  const b = BODIES[body];
  const cx = INSET.x + INSET.size / 2;
  const cy = INSET.y + INSET.size / 2 + 10;
  const planetPx = 18;
  const rpPx = planetPx * Math.min(4, (b.radiusKm + altitudeKm) / b.radiusKm);
  const p = rpPx * (1 + ecc);
  const nuMax = Math.acos(-1 / ecc) * 0.93;

  // Orientamos la hipérbola para que la nave entre con la misma dirección que en la vista principal
  const vin: [number, number] = [Math.sin(nuMax / 0.93), sense * (ecc - 1 / ecc)];
  const rot = inAngle - Math.atan2(vin[1], vin[0]);
  const toScreen = (r: number, nu: number): [number, number] => {
    const x = r * Math.cos(nu);
    const y = sense * r * Math.sin(nu);
    const X = x * Math.cos(rot) - y * Math.sin(rot);
    const Y = x * Math.sin(rot) + y * Math.cos(rot);
    return [cx + X, cy - Y];
  };
  const hyper = (nu: number) => toScreen(p / (1 + ecc * Math.cos(nu)), nu);
  const nuEnd = kind === 'flyby' ? nuMax : 0;
  const pts = Array.from({ length: 61 }, (_, i) => hyper(-nuMax + ((nuEnd + nuMax) * i) / 60));
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  // Órbita de captura (forma exagerada para que se vea en el recuadro)
  const ec = Math.min(0.55, b.captureEcc);
  const ellipse = (nu: number) => toScreen((rpPx * (1 + ec)) / (1 + ec * Math.cos(nu)), nu);
  const orbitD =
    kind === 'arrival'
      ? Array.from({ length: 73 }, (_, i) => ellipse((2 * Math.PI * i) / 72))
          .map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`)
          .join(' ') + 'Z'
      : '';

  let ship: [number, number];
  if (kind === 'flyby') ship = hyper(-nuMax + 2 * nuMax * u);
  else if (u < 0.5) ship = hyper(-nuMax + nuMax * (u * 2));
  else ship = ellipse((u - 0.5) * 2 * Math.PI * 1.5);

  return (
    <g className="inset">
      <rect x={INSET.x} y={INSET.y} width={INSET.size} height={INSET.size} rx={10} className="inset-bg" />
      <g clipPath="url(#inset-clip)">
        <circle cx={cx} cy={cy} r={planetPx} fill={b.color} />
        {orbitD && <path d={orbitD} className={u >= 0.5 ? 'travelled' : 'transfer'} />}
        <path d={d} className="transfer" />
        <circle cx={ship[0]} cy={ship[1]} r={3.5} className="inset-ship" />
      </g>
      <text x={INSET.x + 8} y={INSET.y + 16} className="inset-title">
        {title}
      </text>
      <text x={INSET.x + 8} y={INSET.y + INSET.size - 8} className="inset-detail">
        {detail}
      </text>
    </g>
  );
}
