import type { Destination } from '../engine/types';

interface Props {
  dest: Destination;
  day: number;
  cruiseDays: number;
  lost: boolean;
}

const SIZE = 400;
const C = SIZE / 2;
const EARTH_PERIOD = 365.25;

/**
 * Vista esquemática: Hohmann simplificado desde la Tierra hasta el destino, y luego órbita alrededor de él.
 * Para la Luna la vista es geocéntrica; para planetas, heliocéntrica con escala en raíz cuadrada.
 */
export default function OrbitView({ dest, day, cruiseDays, lost }: Props) {
  const lunar = dest.id === 'moon';
  const scale = (au: number) => 170 * Math.sqrt(au / dest.sunDistanceAU);
  const r1 = lunar ? 28 : scale(1);
  const r2 = lunar ? 160 : scale(dest.sunDistanceAU);

  // Ángulos: la nave sale con θ=0 y llega con θ=π
  const destAngle = (d: number) => Math.PI - ((cruiseDays - d) / dest.orbitPeriodDays) * 2 * Math.PI;
  const earthAngle = (d: number) => (d / EARTH_PERIOD) * 2 * Math.PI;

  const a = (r1 + r2) / 2;
  const e = (r2 - r1) / (r2 + r1);
  const transfer = (theta: number) => {
    const r = (a * (1 - e * e)) / (1 + e * Math.cos(theta));
    return [C + r * Math.cos(theta), C - r * Math.sin(theta)] as const;
  };
  const arc = Array.from({ length: 61 }, (_, i) => transfer((Math.PI * i) / 60))
    .map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');

  const polar = (r: number, ang: number) => [C + r * Math.cos(ang), C - r * Math.sin(ang)] as const;
  const [dx, dy] = polar(r2, destAngle(day));
  const [ex, ey] = lunar ? [C, C] : polar(r1, earthAngle(day));

  let ship: readonly [number, number];
  if (day <= cruiseDays) {
    ship = transfer(Math.PI * Math.min(1, day / Math.max(1, cruiseDays)));
  } else {
    const orbitAng = (day - cruiseDays) * 1.7;
    ship = [dx + 13 * Math.cos(orbitAng), dy - 13 * Math.sin(orbitAng)];
  }

  return (
    <svg className="orbit-view" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Trayectoria de la misión">
      <defs>
        <radialGradient id="sun" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff6c8" />
          <stop offset="60%" stopColor="#ffc845" />
          <stop offset="100%" stopColor="#ff9a1f" stopOpacity="0" />
        </radialGradient>
      </defs>
      {!lunar && <circle cx={C} cy={C} r={r1} className="orbit-ring" />}
      <circle cx={C} cy={C} r={r2} className="orbit-ring" />
      <path d={arc} className="transfer" />

      {lunar ? (
        <circle cx={C} cy={C} r={14} fill="#3b82f6" />
      ) : (
        <>
          <circle cx={C} cy={C} r={22} fill="url(#sun)" />
          <circle cx={ex} cy={ey} r={6} fill="#3b82f6" />
        </>
      )}
      <circle cx={dx} cy={dy} r={dest.id === 'jupiter' ? 11 : 7} fill={dest.color} />
      <text x={dx} y={dy - 16} className="orbit-label">
        {dest.name}
      </text>
      <text x={ex} y={ey + (lunar ? 28 : 18)} className="orbit-label">
        Tierra
      </text>

      <g transform={`translate(${ship[0]},${ship[1]})`} className={lost ? 'ship lost' : 'ship'}>
        <rect x={-3} y={-3} width={6} height={6} />
        <line x1={-9} y1={0} x2={9} y2={0} />
      </g>
    </svg>
  );
}
