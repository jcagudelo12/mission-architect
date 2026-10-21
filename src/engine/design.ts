import { PARTS_BY_ID } from '../data/parts';
import type { Trajectory } from './orbit/transfer';
import type { Destination, Part, Rocket } from './types';

export const G0 = 9.81;
/** Curva simplificada de rendimiento del cohete: fracción de la carga a LEO que puede enviar con energía C3 */
const C3_FRACTION_AT_ZERO = 0.3;
const C3_SCALE = 50;
/** Horas diarias de contacto con la Red de Espacio Profundo (DSN) */
export const DSN_SECONDS_PER_DAY = 4 * 3600;
/** Constante de enlace calibrada para que una antena de 3 m dé ~0.5 Mbps desde Marte */
const LINK_K = 0.3;
const MAX_RATE_BPS = 20e6;
const SOLAR_DEGRADATION = 0.85;
/** Masa de tanques como fracción del propelente */
const TANK_FRACTION = 0.1;
const BEST_FOR_BONUS = 1.5;
/** Penalización si la batería no cubre los eclipses */
const ECLIPSE_PENALTY = 0.75;

export function linkMbPerDay(part: Part, earthDistanceAU: number): number {
  if (!part.gainDbi || !part.txPowerW) return 0;
  const gain = 10 ** (part.gainDbi / 10);
  const bps = Math.min(MAX_RATE_BPS, (LINK_K * part.txPowerW * gain) / earthDistanceAU ** 2);
  return (bps * DSN_SECONDS_PER_DAY) / 1e6;
}

export function solarW(part: Part, sunDistanceAU: number): number {
  return ((part.solarW1AU ?? 0) * SOLAR_DEGRADATION) / sunDistanceAU ** 2;
}

export function scienceMultiplier(part: Part, dest: Destination): number {
  return part.bestFor?.includes(dest.id) ? BEST_FOR_BONUS : 1;
}

/** Cuánta masa puede lanzar el cohete con la energía de salida C3 (km²/s²) */
export function rocketCapacityKg(rocket: Rocket, c3: number): number {
  return Math.round(rocket.leoKg * C3_FRACTION_AT_ZERO * Math.exp(-c3 / C3_SCALE));
}

export interface Allocation {
  science: number;
  /** Ciencia del día aportada por cada instrumento */
  perPart: Record<string, number>;
  active: Part[];
  shed: Part[];
  generatedMb: number;
  returnedMb: number;
  usedPowerW: number;
}

/**
 * Decide qué instrumentos se encienden con la energía disponible (los de más ciencia por vatio primero)
 * y qué datos se envían con el enlace disponible (los de más ciencia por megabit primero).
 */
export function allocate(
  instruments: Part[],
  availablePowerW: number,
  downlinkMb: number,
  dest: Destination,
): Allocation {
  const value = (p: Part) => (p.sciencePerDay ?? 0) * scienceMultiplier(p, dest);
  const byPower = [...instruments].sort((a, b) => value(b) / Math.max(b.powerW, 1) - value(a) / Math.max(a.powerW, 1));
  let power = availablePowerW;
  const active: Part[] = [];
  const shed: Part[] = [];
  for (const p of byPower) {
    if (p.powerW <= power) {
      active.push(p);
      power -= p.powerW;
    } else {
      shed.push(p);
    }
  }

  const byData = [...active].sort(
    (a, b) => value(b) / Math.max(b.dataMbDay ?? 1, 1) - value(a) / Math.max(a.dataMbDay ?? 1, 1),
  );
  let link = downlinkMb;
  let science = 0;
  let generatedMb = 0;
  let returnedMb = 0;
  const perPart: Record<string, number> = {};
  for (const p of byData) {
    const gen = p.dataMbDay ?? 0;
    const sent = Math.min(gen, link);
    link -= sent;
    generatedMb += gen;
    returnedMb += sent;
    perPart[p.id] = value(p) * (gen > 0 ? sent / gen : 1);
    science += perPart[p.id];
  }
  return { science, perPart, active, shed, generatedMb, returnedMb, usedPowerW: availablePowerW - power };
}

export interface DesignReport {
  parts: Part[];
  bus?: Part;
  propulsion?: Part;
  instruments: Part[];
  comms: Part[];
  dryMassKg: number;
  propellantKg: number;
  wetMassKg: number;
  deltaVKms: number;
  partsCostM: number;
  rocketCostM: number;
  opsCostM: number;
  totalCostM: number;
  /** Potencia generada en el destino (W) */
  powerGenW: number;
  /** Consumo de la nave sin instrumentos (W) */
  basePowerW: number;
  /** Consumo total con todos los instrumentos encendidos (W) */
  powerUseW: number;
  batteryWh: number;
  batteryNeedWh: number;
  eclipseFactor: number;
  downlinkMbDay: number;
  dataGenMbDay: number;
  sciencePerDay: number;
  estimatedScience: number;
  shield: number;
  radiationEff: number;
  cruiseDays: number;
  capacityKg?: number;
  trajectory: Trajectory;
  /** Problemas que impiden lanzar */
  errors: string[];
  /** Avisos que no bloquean pero afectan el resultado */
  warnings: string[];
}

export function analyzeDesign(dest: Destination, ids: string[], trajectory: Trajectory, rocket?: Rocket): DesignReport {
  const parts = ids.map((id) => PARTS_BY_ID[id]).filter((p): p is Part => Boolean(p));
  const of = (cat: Part['category']) => parts.filter((p) => p.category === cat);
  const bus = of('bus')[0];
  const propulsion = of('propulsion')[0];
  const instruments = of('instrument');
  const comms = of('comms');
  const power = of('power');
  const errors: string[] = [];
  const warnings: string[] = [];

  // Masa y combustible (ecuación de Tsiolkovsky)
  const dryParts = parts.reduce((s, p) => s + p.massKg, 0);
  const deltaVKms = trajectory.spacecraftDvKms;
  let propellantKg = 0;
  if (propulsion?.isp) {
    const ratio = Math.exp((deltaVKms * 1000) / (propulsion.isp * G0));
    const denom = 1 - TANK_FRACTION * (ratio - 1);
    if (denom <= 0) {
      errors.push('Con este motor, la nave no puede cargar suficiente combustible para frenar en el destino.');
      propellantKg = Infinity;
    } else {
      propellantKg = (dryParts * (ratio - 1)) / denom;
    }
  }
  const tankKg = Number.isFinite(propellantKg) ? propellantKg * TANK_FRACTION : 0;
  const dryMassKg = dryParts + tankKg;
  const wetMassKg = dryMassKg + propellantKg;

  // Energía
  const powerGenW =
    power.reduce((s, p) => s + solarW(p, dest.sunDistanceAU) + (p.rtgW ?? 0), 0);
  const basePowerW = parts.filter((p) => p.category !== 'instrument').reduce((s, p) => s + p.powerW, 0);
  const powerUseW = basePowerW + instruments.reduce((s, p) => s + p.powerW, 0);
  const batteryWh = power.reduce((s, p) => s + (p.batteryWh ?? 0), 0);
  const batteryNeedWh = powerUseW * dest.eclipseHours;
  const eclipseFactor = batteryWh >= batteryNeedWh ? 1 : ECLIPSE_PENALTY;

  // Comunicaciones: se usa la mejor antena
  const downlinkMbDay = Math.max(0, ...comms.map((c) => linkMbPerDay(c, dest.earthDistanceAU)));
  const dataGenMbDay = instruments.reduce((s, p) => s + (p.dataMbDay ?? 0), 0);

  // Ciencia estimada con todo funcionando
  const alloc = allocate(instruments, powerGenW - basePowerW, downlinkMbDay, dest);
  const sciencePerDay = alloc.science * eclipseFactor;
  const estimatedScience = sciencePerDay * dest.opsDays;

  // Radiación
  const shield = Math.max(0, ...parts.map((p) => p.shield ?? 0));
  const radiationEff = 1 + (dest.radiation - 1) * (1 - shield);

  const cruiseDays = Math.max(1, Math.round(trajectory.tofDays));

  // Costos
  const partsCostM = parts.reduce((s, p) => s + p.costM, 0);
  const rocketCostM = rocket?.costM ?? 0;
  const opsCostM = (dest.opsCostPerYearM * (cruiseDays + dest.opsDays)) / 365;
  const totalCostM = partsCostM + rocketCostM + opsCostM;
  const capacityKg = rocket ? rocketCapacityKg(rocket, trajectory.c3) : undefined;

  // Validaciones que bloquean
  if (!bus) errors.push('Elige una estructura (bus).');
  if (!propulsion) errors.push('Elige un sistema de propulsión: lo necesitas para entrar en órbita.');
  if (power.every((p) => !p.solarW1AU && !p.rtgW)) errors.push('Agrega una fuente de energía (paneles o RTG).');
  if (comms.length === 0) errors.push('Agrega al menos una antena para enviar datos a la Tierra.');
  if (instruments.length === 0) errors.push('Una misión sin instrumentos no hace ciencia: agrega al menos uno.');
  if (bus?.maxInstruments !== undefined && instruments.length > bus.maxInstruments)
    errors.push(`El ${bus.name.toLowerCase()} solo admite ${bus.maxInstruments} instrumentos.`);
  if (powerGenW > 0 && basePowerW > powerGenW)
    errors.push(
      `En ${dest.name} generas ${Math.round(powerGenW)} W pero la nave consume ${Math.round(basePowerW)} W sin encender ningún instrumento.`,
    );
  if (totalCostM > dest.budgetM)
    errors.push(`Te pasas del presupuesto por $${Math.round(totalCostM - dest.budgetM)} M.`);
  if (capacityKg !== undefined && wetMassKg > capacityKg)
    errors.push(`La nave (${Math.round(wetMassKg)} kg) pesa más de lo que el ${rocket!.name} puede enviar a ${dest.name} (${capacityKg} kg).`);

  // Avisos
  if (alloc.shed.length > 0)
    warnings.push(`No hay energía para encender: ${alloc.shed.map((p) => p.name).join(', ')}.`);
  if (eclipseFactor < 1)
    warnings.push(`La batería no cubre los eclipses (necesitas ${Math.round(batteryNeedWh)} Wh): los instrumentos se apagarán en la sombra.`);
  if (alloc.generatedMb > 0 && alloc.returnedMb < alloc.generatedMb * 0.8)
    warnings.push(
      `Generas ${fmtMb(alloc.generatedMb)}/día pero solo puedes enviar ${fmtMb(downlinkMbDay)}/día: se perderán datos.`,
    );
  if (dest.radiation > 2 && shield < 0.5)
    warnings.push('La radiación aquí es extrema: sin blindaje fuerte la electrónica fallará pronto.');
  if (comms.length === 1) warnings.push('Una sola antena: si falla, perderás la nave.');
  if (instruments.length > 0 && estimatedScience < dest.scienceTarget)
    warnings.push('Con este diseño no alcanzarías la meta científica ni con todo funcionando.');

  return {
    parts,
    bus,
    propulsion,
    instruments,
    comms,
    dryMassKg,
    propellantKg,
    wetMassKg,
    deltaVKms,
    partsCostM,
    rocketCostM,
    opsCostM,
    totalCostM,
    powerGenW,
    basePowerW,
    powerUseW,
    batteryWh,
    batteryNeedWh,
    eclipseFactor,
    downlinkMbDay,
    dataGenMbDay,
    sciencePerDay,
    estimatedScience,
    shield,
    radiationEff,
    cruiseDays,
    capacityKg,
    trajectory,
    errors,
    warnings,
  };
}

export function fmtMb(mb: number): string {
  if (mb >= 1000) return `${(mb / 1000).toFixed(1)} Gb`;
  if (mb >= 1) return `${Math.round(mb)} Mb`;
  return `${Math.round(mb * 1000)} kb`;
}
