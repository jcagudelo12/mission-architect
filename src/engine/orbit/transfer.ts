import type { DestinationId } from '../types';
import { BODIES, DAY_S, MU_SUN, R_LEO_KM, dayFromDate, helioState, moonState, type BodyId, type State } from './bodies';
import { lambert, propagate } from './kepler';
import { angleBetween, cross, norm, scale, sub, type Vec } from './vec';

export interface Route {
  id: string;
  name: string;
  description: string;
  /** Cuerpos en orden: salida, sobrevuelos y destino */
  sequence: BodyId[];
  /** Rango de duración de cada tramo (días) */
  legRanges: [number, number][];
  /** 'Sun' = trayectoria heliocéntrica; 'Earth' = geocéntrica (Luna) */
  central: 'Sun' | 'Earth';
}

export const ROUTES: Record<DestinationId, Route[]> = {
  moon: [
    {
      id: 'moon-direct',
      name: 'Transferencia directa',
      description: 'Inyección translunar desde la órbita baja y llegada en pocos días, como Apolo y LRO.',
      sequence: ['Earth', 'Moon'],
      legRanges: [[2.5, 7]],
      central: 'Earth',
    },
  ],
  mars: [
    {
      id: 'mars-direct',
      name: 'Directa',
      description: 'De la Tierra a Marte en un solo arco. Las ventanas se abren cada ~26 meses.',
      sequence: ['Earth', 'Mars'],
      legRanges: [[120, 420]],
      central: 'Sun',
    },
    {
      id: 'mars-venus',
      name: 'Vía Venus',
      description: 'Pasar cerca de Venus para que su gravedad doble la trayectoria hacia Marte.',
      sequence: ['Earth', 'Venus', 'Mars'],
      legRanges: [
        [80, 260],
        [150, 450],
      ],
      central: 'Sun',
    },
  ],
  jupiter: [
    {
      id: 'jupiter-direct',
      name: 'Directa',
      description: 'Viaje directo: rápido, pero exige muchísima energía al cohete (C3 alto).',
      sequence: ['Earth', 'Jupiter'],
      legRanges: [[500, 1300]],
      central: 'Sun',
    },
    {
      id: 'jupiter-mars',
      name: 'Vía Marte',
      description: 'Un sobrevuelo de Marte desvía y acelera la nave hacia Júpiter, como hizo Europa Clipper.',
      sequence: ['Earth', 'Mars', 'Jupiter'],
      legRanges: [
        [100, 450],
        [400, 1300],
      ],
      central: 'Sun',
    },
  ],
};

/** Rango de fechas de lanzamiento que se exploran */
export const SEARCH_START = dayFromDate(new Date(Date.UTC(2027, 0, 1)));
export const SEARCH_END = dayFromDate(new Date(Date.UTC(2037, 0, 1)));
/** A la Luna se puede ir casi cualquier día: basta explorar dos meses */
const MOON_SEARCH_DAYS = 60;
/** Margen para correcciones de trayectoria (TCM) y ajustes de órbita */
const NAV_MARGIN_KMS = 0.15;

export interface Leg {
  from: BodyId;
  to: BodyId;
  t0: number;
  t1: number;
  r0: Vec;
  v0: Vec;
}

export interface Flyby {
  body: BodyId;
  day: number;
  altitudeKm: number;
  turnDeg: number;
  vinfInKms: number;
  vinfOutKms: number;
  /** Δv que hay que aplicar en el periapsis si las velocidades de entrada y salida no coinciden */
  dvKms: number;
  /** Cambio de rapidez respecto al Sol ganado gracias al planeta */
  gainKms: number;
  /** +1 si la nave gira en sentido antihorario alrededor del planeta */
  sense: 1 | -1;
  /** Dirección de la velocidad de llegada relativa al planeta (ángulo en el plano, rad) */
  inAngle: number;
}

export interface Trajectory {
  routeId: string;
  routeName: string;
  central: 'Sun' | 'Earth';
  sequence: BodyId[];
  launchDay: number;
  arrivalDay: number;
  tofDays: number;
  legs: Leg[];
  flybys: Flyby[];
  /** Energía de lanzamiento (km²/s²): lo que el cohete debe aportar */
  c3: number;
  departureDvKms: number;
  arrivalVinfKms: number;
  /** Dirección de llegada relativa al destino (ángulo en el plano, rad) */
  arrivalAngle: number;
  insertionDvKms: number;
  flybyDvKms: number;
  /** Δv que pone la nave con su propio motor */
  spacecraftDvKms: number;
  /** Δv total de la misión (cohete + nave): la métrica para comparar trayectorias */
  totalDvKms: number;
}

const MU_EARTH = BODIES.Earth.mu;

function bodyState(route: Route, body: BodyId, day: number): State {
  if (route.central === 'Earth') {
    if (body === 'Earth') return { r: [0, 0, 0], v: [0, 0, 0] };
    return moonState(day);
  }
  return helioState(body, day);
}

export function centralMu(route: Pick<Route, 'central'>): number {
  return route.central === 'Earth' ? MU_EARTH : MU_SUN;
}

/** Δv para quedar capturado en la órbita objetivo llegando con v∞ */
export function captureDv(body: BodyId, vinf: number): number {
  const b = BODIES[body];
  const rp = b.radiusKm + b.captureAltKm;
  return Math.sqrt(vinf * vinf + (2 * b.mu) / rp) - Math.sqrt((b.mu * (1 + b.captureEcc)) / rp);
}

function departureDv(c3: number): number {
  return Math.sqrt(c3 + (2 * MU_EARTH) / R_LEO_KM) - Math.sqrt(MU_EARTH / R_LEO_KM);
}

/** Geometría de un sobrevuelo (asistencia gravitatoria) a partir de v∞ de entrada y salida */
function flybyGeometry(body: BodyId, vin: Vec, vout: Vec) {
  const b = BODIES[body];
  const a = norm(vin);
  const c = norm(vout);
  const turn = angleBetween(vin, vout);
  const vm = (a + c) / 2;
  // El planeta solo puede doblar la trayectoria hasta cierto ángulo: depende de qué tan cerca pases
  const ecc = 1 / Math.sin(Math.max(turn, 1e-6) / 2);
  const rp = (b.mu * (ecc - 1)) / (vm * vm);
  if (rp < b.radiusKm + b.minFlybyAltKm) return null;
  const dv = Math.abs(Math.sqrt(c * c + (2 * b.mu) / rp) - Math.sqrt(a * a + (2 * b.mu) / rp));
  return {
    altitudeKm: rp - b.radiusKm,
    turnDeg: (turn * 180) / Math.PI,
    vinfInKms: a,
    vinfOutKms: c,
    dvKms: dv,
    sense: (cross(vin, vout)[2] >= 0 ? 1 : -1) as 1 | -1,
    inAngle: Math.atan2(vin[1], vin[0]),
  };
}

/** Punto de salida en la órbita baja para ir a la Luna: transferencia de ~172° hacia donde estará la Luna */
const MOON_TRANSFER_ANGLE = (172 * Math.PI) / 180;

/**
 * Evalúa una trayectoria concreta: fecha de salida y duración de cada tramo.
 * Devuelve null si no existe o si algún sobrevuelo tendría que pasar por debajo de la superficie.
 */
export function evaluate(route: Route, launchDay: number, legDays: number[]): Trajectory | null {
  const mu = centralMu(route);
  const times = [launchDay];
  for (const d of legDays) times.push(times[times.length - 1] + d);
  const states = route.sequence.map((b, i) => bodyState(route, b, times[i]));

  if (route.central === 'Earth') {
    // Salimos de la órbita baja (no del centro de la Tierra)
    const target = states[1].r;
    const ang = Math.atan2(target[1], target[0]) - MOON_TRANSFER_ANGLE;
    states[0] = { r: [R_LEO_KM * Math.cos(ang), R_LEO_KM * Math.sin(ang), 0], v: [0, 0, 0] };
  }

  const legs: Leg[] = [];
  const sols: { v1: Vec; v2: Vec }[] = [];
  for (let i = 0; i < legDays.length; i++) {
    const sol = lambert(states[i].r, states[i + 1].r, legDays[i] * DAY_S, mu);
    if (!sol) return null;
    sols.push(sol);
    legs.push({ from: route.sequence[i], to: route.sequence[i + 1], t0: times[i], t1: times[i + 1], r0: states[i].r, v0: sol.v1 });
  }

  let c3: number;
  let depDv: number;
  if (route.central === 'Earth') {
    const v1 = sols[0].v1;
    c3 = norm(v1) ** 2 - (2 * MU_EARTH) / R_LEO_KM;
    const r = states[0].r;
    const vCirc = scale([-r[1], r[0], 0], Math.sqrt(MU_EARTH / R_LEO_KM) / R_LEO_KM);
    depDv = norm(sub(v1, vCirc));
  } else {
    c3 = norm(sub(sols[0].v1, states[0].v)) ** 2;
    depDv = departureDv(c3);
  }
  if (c3 > 150) return null;

  const flybys: Flyby[] = [];
  for (let i = 1; i < route.sequence.length - 1; i++) {
    const body = route.sequence[i];
    const vin = sub(sols[i - 1].v2, states[i].v);
    const vout = sub(sols[i].v1, states[i].v);
    const geo = flybyGeometry(body, vin, vout);
    if (!geo) return null;
    flybys.push({ body, day: times[i], gainKms: norm(sols[i].v1) - norm(sols[i - 1].v2), ...geo });
  }
  const flybyDv = flybys.reduce((s, f) => s + f.dvKms, 0);

  const last = route.sequence.length - 1;
  const vinfArr = sub(sols[last - 1].v2, states[last].v);
  const arrivalVinf = norm(vinfArr);
  const insertion = captureDv(route.sequence[last], arrivalVinf);
  const spacecraftDv = insertion + flybyDv + NAV_MARGIN_KMS;

  return {
    routeId: route.id,
    routeName: route.name,
    central: route.central,
    sequence: route.sequence,
    launchDay,
    arrivalDay: times[last],
    tofDays: times[last] - launchDay,
    legs,
    flybys,
    c3,
    departureDvKms: depDv,
    arrivalVinfKms: arrivalVinf,
    arrivalAngle: Math.atan2(vinfArr[1], vinfArr[0]),
    insertionDvKms: insertion,
    flybyDvKms: flybyDv,
    spacecraftDvKms: spacecraftDv,
    totalDvKms: depDv + spacecraftDv,
  };
}

/** Cuántos días antes y después de un sobrevuelo o de la llegada se muestra el acercamiento */
export function eventWindowDays(traj: Trajectory): number {
  return traj.central === 'Earth' ? 0.35 : Math.max(4, traj.tofDays * 0.025);
}

/** true si la fecha está cerca de un sobrevuelo o de la llegada */
export function nearEvent(traj: Trajectory, day: number): boolean {
  const w = eventWindowDays(traj);
  return Math.abs(day - traj.arrivalDay) < w || traj.flybys.some((f) => Math.abs(day - f.day) < w);
}

/** Posición de la nave (km, marco del cuerpo central) en un día dado */
export function shipPosition(traj: Trajectory, day: number): Vec {
  const mu = centralMu(traj);
  const leg = traj.legs.find((l) => day <= l.t1) ?? traj.legs[traj.legs.length - 1];
  const dt = Math.min(Math.max(day, leg.t0), leg.t1) - leg.t0;
  return propagate(leg.r0, leg.v0, dt * DAY_S, mu).r;
}

export function samplePath(traj: Trajectory, n = 240): Vec[] {
  return Array.from({ length: n + 1 }, (_, i) => shipPosition(traj, traj.launchDay + (traj.tofDays * i) / n));
}

// --- Búsqueda de ventanas ---

export interface WindowPoint {
  launchDay: number;
  totalDvKms: number;
  c3: number;
  legDays: number[];
}

function range(lo: number, hi: number, step: number): number[] {
  const out: number[] = [];
  for (let x = lo; x <= hi + 1e-9; x += step) out.push(Math.round(x * 4) / 4);
  return out;
}

function legGrid(route: Route, steps: number): number[][] {
  const axes = route.legRanges.map(([lo, hi]) => range(lo, hi, (hi - lo) / steps));
  return axes.reduce<number[][]>((acc, axis) => acc.flatMap((combo) => axis.map((d) => [...combo, d])), [[]]);
}

export function searchSpan(route: Route): [number, number] {
  return route.central === 'Earth' ? [SEARCH_START, SEARCH_START + MOON_SEARCH_DAYS] : [SEARCH_START, SEARCH_END];
}

/**
 * Para cada fecha de lanzamiento, la mejor trayectoria encontrada en una malla gruesa.
 * Los valles de esta curva son las ventanas de lanzamiento.
 */
export function scanRoute(route: Route): WindowPoint[] {
  const [start, end] = searchSpan(route);
  const multi = route.sequence.length > 2;
  const launchStep = route.central === 'Earth' ? 0.5 : multi ? 8 : 4;
  const combos = legGrid(route, route.central === 'Earth' ? 18 : multi ? 14 : 30);
  const out: WindowPoint[] = [];
  for (const launch of range(start, end, launchStep)) {
    let best: WindowPoint | null = null;
    for (const legs of combos) {
      const t = evaluate(route, launch, legs);
      if (t && (!best || t.totalDvKms < best.totalDvKms)) best = { launchDay: launch, totalDvKms: t.totalDvKms, c3: t.c3, legDays: legs };
    }
    if (best) out.push(best);
  }
  return out;
}

/** Refina la mejor trayectoria alrededor de un punto de la malla gruesa */
export function refine(route: Route, seed: WindowPoint): Trajectory | null {
  const moon = route.central === 'Earth';
  const multi = route.sequence.length > 2;
  const launchSpan = moon ? 0.5 : multi ? 8 : 4;
  let best = evaluate(route, seed.launchDay, seed.legDays);
  let bestLegs = seed.legDays;
  let bestLaunch = seed.launchDay;
  // Dos pasadas: primero gruesa y luego fina alrededor del mejor punto
  for (const frac of [1, 0.25]) {
    const lStep = moon ? 0.25 : Math.max(1, Math.round((launchSpan * frac) / 2));
    const launches = range(bestLaunch - launchSpan * frac, bestLaunch + launchSpan * frac, lStep);
    const legAxes = route.legRanges.map(([lo, hi], i) => {
      const span = ((hi - lo) / (multi ? 14 : 30)) * frac * 2;
      const step = moon ? 0.25 : Math.max(1, Math.round(span / 4));
      return range(Math.max(lo, bestLegs[i] - span), Math.min(hi, bestLegs[i] + span), step);
    });
    const combos = legAxes.reduce<number[][]>((acc, axis) => acc.flatMap((c) => axis.map((d) => [...c, d])), [[]]);
    const center = { launch: bestLaunch, legs: bestLegs };
    for (const launch of launches) {
      for (const legs of combos) {
        const t = evaluate(route, launch, legs);
        if (t && (!best || t.totalDvKms < best.totalDvKms)) {
          best = t;
          center.launch = launch;
          center.legs = legs;
        }
      }
    }
    bestLaunch = center.launch;
    bestLegs = center.legs;
  }
  return best;
}

/** Ventanas: mínimos locales de la curva de costo (sin repetir valles cercanos), ordenados por fecha */
export function findWindows(route: Route, points: WindowPoint[], max = 8): WindowPoint[] {
  const minSeparation = route.central === 'Earth' ? 3 : 90;
  const minima = points.filter((p, i) => {
    const prev = points[i - 1];
    const next = points[i + 1];
    return (!prev || p.totalDvKms <= prev.totalDvKms) && (!next || p.totalDvKms < next.totalDvKms);
  });
  const best = Math.min(...minima.map((p) => p.totalDvKms));
  const kept: WindowPoint[] = [];
  // Solo los valles razonablemente buenos, para no listar ruido
  for (const p of minima.filter((m) => m.totalDvKms < best * 1.25).sort((a, b) => a.totalDvKms - b.totalDvKms)) {
    if (kept.length >= max) break;
    if (kept.every((k) => Math.abs(k.launchDay - p.launchDay) >= minSeparation)) kept.push(p);
  }
  return kept.sort((a, b) => a.launchDay - b.launchDay);
}

export function findRoute(routeId: string): Route | undefined {
  return Object.values(ROUTES)
    .flat()
    .find((r) => r.id === routeId);
}

export interface PorkchopCell {
  launchDay: number;
  tofDays: number;
  totalDvKms: number | null;
}

/** Mapa de "chuletas" (porkchop plot): costo según fecha de salida y duración, solo para rutas directas */
export function porkchop(route: Route, centerLaunch: number, launchHalfSpan: number, cols = 60, rows = 40): PorkchopCell[] {
  const [lo, hi] = route.legRanges[0];
  const cells: PorkchopCell[] = [];
  for (let j = 0; j < rows; j++) {
    const tof = lo + ((hi - lo) * j) / (rows - 1);
    for (let i = 0; i < cols; i++) {
      const launch = centerLaunch - launchHalfSpan + (2 * launchHalfSpan * i) / (cols - 1);
      const t = evaluate(route, launch, [tof]);
      cells.push({ launchDay: launch, tofDays: tof, totalDvKms: t ? t.totalDvKms : null });
    }
  }
  return cells;
}
