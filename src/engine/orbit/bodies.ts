import * as Astronomy from 'astronomy-engine';
import type { Vec } from './vec';

export const AU_KM = 149_597_870.7;
export const DAY_S = 86_400;
export const MU_SUN = 1.32712440018e11; // km³/s²
/** Radio de la órbita de estacionamiento desde la que sale la nave (LEO de 300 km) */
export const R_LEO_KM = 6678;

export type BodyId = 'Venus' | 'Earth' | 'Moon' | 'Mars' | 'Jupiter';

export interface BodyInfo {
  id: BodyId;
  name: string;
  /** Parámetro gravitacional (km³/s²) */
  mu: number;
  radiusKm: number;
  /** Altitud mínima segura para un sobrevuelo */
  minFlybyAltKm: number;
  /** Órbita de captura al llegar: altitud del periapsis y excentricidad */
  captureAltKm: number;
  captureEcc: number;
  color: string;
}

export const BODIES: Record<BodyId, BodyInfo> = {
  Venus: { id: 'Venus', name: 'Venus', mu: 324_859, radiusKm: 6052, minFlybyAltKm: 300, captureAltKm: 300, captureEcc: 0.5, color: '#e8c27a' },
  Earth: { id: 'Earth', name: 'Tierra', mu: 398_600.4418, radiusKm: 6378, minFlybyAltKm: 300, captureAltKm: 300, captureEcc: 0, color: '#3b82f6' },
  Moon: { id: 'Moon', name: 'Luna', mu: 4902.8, radiusKm: 1737, minFlybyAltKm: 50, captureAltKm: 100, captureEcc: 0, color: '#c9c9c9' },
  // Captura en órbita elíptica, como MRO (35 h) antes de bajarla
  Mars: { id: 'Mars', name: 'Marte', mu: 42_828, radiusKm: 3390, minFlybyAltKm: 200, captureAltKm: 300, captureEcc: 0.8, color: '#d1603d' },
  // Órbita polar de 53 días como Juno
  Jupiter: { id: 'Jupiter', name: 'Júpiter', mu: 1.26686534e8, radiusKm: 71_492, minFlybyAltKm: 300_000, captureAltKm: 4200, captureEcc: 0.98, color: '#d8a46c' },
};

export interface State {
  /** Posición (km) */
  r: Vec;
  /** Velocidad (km/s) */
  v: Vec;
}

// Las efemérides vienen en el ecuador J2000; las pasamos al plano de la eclíptica para dibujar en 2D
const EQJ_TO_ECL = Astronomy.Rotation_EQJ_ECL();
const AU_PER_DAY_TO_KMS = AU_KM / DAY_S;
const cache = new Map<string, State>();

function toState(s: Astronomy.StateVector): State {
  const e = Astronomy.RotateState(EQJ_TO_ECL, s);
  return {
    r: [e.x * AU_KM, e.y * AU_KM, e.z * AU_KM],
    v: [e.vx * AU_PER_DAY_TO_KMS, e.vy * AU_PER_DAY_TO_KMS, e.vz * AU_PER_DAY_TO_KMS],
  };
}

/** Estado heliocéntrico real de un planeta. `day` = días desde J2000 (1 ene 2000, 12:00 UT). */
export function helioState(body: BodyId, day: number): State {
  const key = `${body}:${day}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const s = toState(Astronomy.HelioState(Astronomy.Body[body], day));
  if (Number.isInteger(day * 4)) cache.set(key, s);
  return s;
}

/** Estado geocéntrico real de la Luna. */
export function moonState(day: number): State {
  const key = `geomoon:${day}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const s = toState(Astronomy.GeoMoonState(day));
  if (Number.isInteger(day * 4)) cache.set(key, s);
  return s;
}

const J2000_MS = Date.UTC(2000, 0, 1, 12);

export const dayFromDate = (d: Date): number => (d.getTime() - J2000_MS) / 86_400_000;
export const dateFromDay = (day: number): Date => new Date(J2000_MS + day * 86_400_000);

export function fmtDate(day: number, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  return dateFromDay(day).toLocaleDateString('es', { ...opts, timeZone: 'UTC' });
}
