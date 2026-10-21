import { cross, dot, norm, scale, sub, add, type Vec } from './vec';

// Funciones de Stumpff para la formulación de variables universales (Curtis, Orbital Mechanics for Engineering Students)
function stumpffC(z: number): number {
  if (z > 1e-6) return (1 - Math.cos(Math.sqrt(z))) / z;
  if (z < -1e-6) return (Math.cosh(Math.sqrt(-z)) - 1) / -z;
  return 1 / 2 - z / 24 + (z * z) / 720;
}

function stumpffS(z: number): number {
  if (z > 1e-6) {
    const s = Math.sqrt(z);
    return (s - Math.sin(s)) / (s * s * s);
  }
  if (z < -1e-6) {
    const s = Math.sqrt(-z);
    return (Math.sinh(s) - s) / (s * s * s);
  }
  return 1 / 6 - z / 120 + (z * z) / 5040;
}

/**
 * Problema de Lambert: qué velocidades se necesitan para ir de r1 a r2 en un tiempo dt (s)
 * alrededor de un cuerpo con parámetro gravitacional mu. Solo transferencias directas (prógradas, < 1 vuelta).
 */
export function lambert(r1: Vec, r2: Vec, dt: number, mu: number): { v1: Vec; v2: Vec } | null {
  const r1n = norm(r1);
  const r2n = norm(r2);
  const cosDth = Math.min(1, Math.max(-1, dot(r1, r2) / (r1n * r2n)));
  let dth = Math.acos(cosDth);
  if (cross(r1, r2)[2] < 0) dth = 2 * Math.PI - dth;
  const A = Math.sin(dth) * Math.sqrt((r1n * r2n) / (1 - cosDth));
  if (!Number.isFinite(A) || Math.abs(A) < 1e-9) return null;

  const sqrtMu = Math.sqrt(mu);
  const y = (z: number) => r1n + r2n + (A * (z * stumpffS(z) - 1)) / Math.sqrt(stumpffC(z));
  // F(z) crece con z: bisección entre una órbita muy hiperbólica y el límite de una vuelta (z = 4π²)
  const F = (z: number) => {
    const yz = y(z);
    if (yz < 0) return -Infinity;
    return (yz / stumpffC(z)) ** 1.5 * stumpffS(z) + A * Math.sqrt(yz) - sqrtMu * dt;
  };
  let lo = -400;
  let hi = 4 * Math.PI * Math.PI - 1e-6;
  if (F(lo) > 0 || F(hi) < 0) return null;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (F(mid) < 0) lo = mid;
    else hi = mid;
  }
  const z = (lo + hi) / 2;
  const yz = y(z);
  if (yz <= 0) return null;
  const f = 1 - yz / r1n;
  const g = A * Math.sqrt(yz / mu);
  const gdot = 1 - yz / r2n;
  return { v1: scale(sub(r2, scale(r1, f)), 1 / g), v2: scale(sub(scale(r2, gdot), r1), 1 / g) };
}

/** Propaga una órbita kepleriana dt segundos desde (r0, v0). */
export function propagate(r0: Vec, v0: Vec, dt: number, mu: number): { r: Vec; v: Vec } {
  if (dt === 0) return { r: r0, v: v0 };
  const r0n = norm(r0);
  const vr0 = dot(r0, v0) / r0n;
  const alpha = 2 / r0n - dot(v0, v0) / mu;
  const sqrtMu = Math.sqrt(mu);
  let chi = sqrtMu * Math.abs(alpha) * dt;
  if (!Number.isFinite(chi) || chi === 0) chi = (sqrtMu * dt) / r0n;
  for (let i = 0; i < 60; i++) {
    const z = alpha * chi * chi;
    const C = stumpffC(z);
    const S = stumpffS(z);
    const F = ((r0n * vr0) / sqrtMu) * chi * chi * C + (1 - alpha * r0n) * chi ** 3 * S + r0n * chi - sqrtMu * dt;
    const dF = ((r0n * vr0) / sqrtMu) * chi * (1 - z * S) + (1 - alpha * r0n) * chi * chi * C + r0n;
    const step = F / dF;
    chi -= step;
    if (Math.abs(step) < 1e-9 * Math.max(1, Math.abs(chi))) break;
  }
  const z = alpha * chi * chi;
  const C = stumpffC(z);
  const S = stumpffS(z);
  const f = 1 - (chi * chi * C) / r0n;
  const g = dt - (chi ** 3 * S) / sqrtMu;
  const r = add(scale(r0, f), scale(v0, g));
  const rn = norm(r);
  const fdot = (sqrtMu / (rn * r0n)) * (z * S - 1) * chi;
  const gdot = 1 - (chi * chi * C) / rn;
  return { r, v: add(scale(r0, fdot), scale(v0, gdot)) };
}
