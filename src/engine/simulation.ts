import { allocate, analyzeDesign, linkMbPerDay, solarW, type DesignReport } from './design';
import { AU_KM, BODIES, helioState, moonState } from './orbit/bodies';
import { shipPosition, type Trajectory } from './orbit/transfer';
import { angleBetween, norm, scale, sub } from './orbit/vec';
import { mulberry32 } from './rng';
import type { Destination, EventKind, Outcome, Part, Phase, Rocket, Sample, SimEvent } from './types';

export interface SimResult {
  report: DesignReport;
  seed: number;
  outcome: Outcome;
  lostReason?: string;
  inserted: boolean;
  events: SimEvent[];
  samples: Sample[];
  cruiseDays: number;
  totalDays: number;
  /** Día en que terminó la misión (antes de totalDays si se perdió la nave) */
  endDay: number;
  science: number;
  scienceByPart: Record<string, number>;
  failedParts: Part[];
  shedDays: number;
  blackoutDays: number;
  /** Días sin contacto porque el Sol estaba entre la Tierra y la nave */
  conjunctionDays: number;
  lostDataMb: number;
  score: number;
}

// Probabilidades diarias de eventos aleatorios
const P_SOLAR_STORM = 1 / 300;
const P_MICROMETEOROID = 1 / 2500;
const P_COMMS_ANOMALY = 1 / 450;
const P_SAFE_MODE = 1 / 500;
const CRUISE_INSTRUMENT_WEAR = 0.3;
/** Si el Sol queda a menos de este ángulo de la nave vista desde la Tierra, no hay comunicación */
const CONJUNCTION_DEG = 2;
/** Un sobrevuelo con más Δv que esto necesita el motor encendido */
const POWERED_FLYBY_KMS = 0.05;

/** Distancias reales al Sol y a la Tierra (UA), y si hay conjunción solar, para un día de misión */
function geometry(dest: Destination, traj: Trajectory, day: number, inOrbit: boolean) {
  const abs = traj.launchDay + day;
  if (traj.central === 'Earth') {
    const pos = inOrbit ? moonState(abs).r : shipPosition(traj, abs);
    return { sunAU: 1, earthAU: norm(pos) / AU_KM, conjunction: false };
  }
  const earth = helioState('Earth', abs).r;
  const pos = inOrbit ? helioState(dest.body, abs).r : shipPosition(traj, abs);
  const toShip = sub(pos, earth);
  const toSun = scale(earth, -1);
  const conjunction = (angleBetween(toShip, toSun) * 180) / Math.PI < CONJUNCTION_DEG;
  return { sunAU: norm(pos) / AU_KM, earthAU: norm(toShip) / AU_KM, conjunction };
}

export function simulate(dest: Destination, ids: string[], traj: Trajectory, rocket: Rocket, seed: number): SimResult {
  const report = analyzeDesign(dest, ids, traj, rocket);
  const rng = mulberry32(seed);
  const { parts, bus, propulsion, cruiseDays } = report;
  const totalDays = cruiseDays + dest.opsDays;
  const alive = new Set(parts.map((p) => p.id));
  const isAlive = (p?: Part) => !!p && alive.has(p.id);
  const redundancy = parts.some((p) => p.redundancy);
  const hasSolar = parts.some((p) => p.solarW1AU);

  const events: SimEvent[] = [];
  const samples: Sample[] = [];
  const scienceByPart: Record<string, number> = {};
  const failedParts: Part[] = [];
  const phaseOf = (day: number): Phase => (day === 0 ? 'launch' : day <= cruiseDays ? 'cruise' : 'ops');
  const log = (day: number, kind: EventKind, text: string) => events.push({ day, phase: phaseOf(day), kind, text });

  let panelFactor = 1;
  let science = 0;
  let blackoutUntil = -1;
  let safeModeUntil = -1;
  let shedDays = 0;
  let blackoutDays = 0;
  let conjunctionDays = 0;
  let inConjunction = false;
  let lostDataMb = 0;
  let inserted = false;
  let lostReason: string | undefined;
  let endDay = totalDays;
  const sampleEvery = Math.max(1, Math.round(totalDays / 300));
  const flybys = new Map(traj.flybys.map((f) => [Math.max(1, Math.round(f.day - traj.launchDay)), f]));

  const fail = (day: number, p: Part, cause: string) => {
    alive.delete(p.id);
    failedParts.push(p);
    log(day, 'danger', `${cause}: falló ${p.name.toLowerCase()}.`);
  };

  const powerAt = (sunAU: number) =>
    parts
      .filter(isAlive)
      .reduce((s, p) => s + solarW(p, sunAU) * panelFactor + (p.rtgW ?? 0), 0);

  // --- Lanzamiento ---
  log(0, 'info', `Despegue a bordo de ${rocket.name} con ${Math.round(report.wetMassKg)} kg.`);
  if (rng() > rocket.reliability) {
    lostReason = `El ${rocket.name} falló durante el ascenso. Ningún diseño sobrevive a eso: es el riesgo de cada lanzamiento.`;
    log(0, 'danger', lostReason);
    endDay = 0;
  } else {
    log(
      0,
      'good',
      `Separación exitosa con C3 = ${traj.c3.toFixed(1)} km²/s². Rumbo a ${dest.name}: ${cruiseDays} días de crucero.`,
    );
  }

  for (let day = 1; day <= totalDays && !lostReason; day++) {
    const phase = phaseOf(day);

    // Fallas por desgaste y radiación: la radiación del destino solo pega al llegar,
    // y en crucero los instrumentos viajan apagados (hibernación)
    const radiation = phase === 'ops' ? report.radiationEff : 1;
    for (const p of parts) {
      if (!alive.has(p.id) || p.failPerYear <= 0) continue;
      let rate = p.failPerYear * radiation;
      if (p.category === 'bus' && redundancy) rate /= 2;
      if (phase === 'cruise' && p.category === 'instrument') rate *= CRUISE_INSTRUMENT_WEAR;
      if (rng() < rate / 365) fail(day, p, radiation > 2 ? 'Daño por radiación' : 'Desgaste');
    }

    // Eventos aleatorios
    if (rng() < P_SOLAR_STORM) {
      if (report.shield >= 0.4) {
        log(day, 'info', 'Tormenta solar: el blindaje protegió la electrónica.');
      } else {
        const victims = parts.filter((p) => alive.has(p.id) && (p.category === 'instrument' || p.category === 'comms'));
        if (victims.length > 0 && rng() < 0.5) fail(day, victims[Math.floor(rng() * victims.length)], 'Tormenta solar');
        else log(day, 'warning', 'Tormenta solar: sin daños esta vez, pero la nave no tiene blindaje.');
      }
    }
    if (hasSolar && rng() < P_MICROMETEOROID) {
      panelFactor *= 0.9;
      log(day, 'warning', 'Un micrometeorito golpeó los paneles solares: -10 % de potencia.');
    }
    if (rng() < P_COMMS_ANOMALY) {
      const working = parts.filter((p) => p.category === 'comms' && alive.has(p.id));
      if (working.length >= 2) {
        log(day, 'info', 'Falla temporal del transmisor principal: se usó la antena de respaldo.');
      } else {
        const d = 3 + Math.floor(rng() * 6);
        blackoutUntil = day + d;
        log(day, 'warning', `Anomalía de comunicaciones: ${d} días sin contacto.`);
      }
    }
    if (rng() < P_SAFE_MODE) {
      const d = redundancy ? 1 : 3 + Math.floor(rng() * 5);
      safeModeUntil = Math.max(safeModeUntil, day + d);
      log(
        day,
        'warning',
        redundancy
          ? 'Error de software: la computadora redundante tomó el control en 1 día.'
          : `Error de software: la nave entró en modo seguro durante ${d} días.`,
      );
    }

    // Fallas críticas
    const geo = geometry(dest, traj, day, phase === 'ops');
    const gen = powerAt(geo.sunAU);
    const comms = parts.filter((p) => p.category === 'comms' && alive.has(p.id));
    if (!isAlive(bus)) lostReason = 'La computadora principal falló y la nave quedó a la deriva.';
    else if (gen <= 0) lostReason = 'La nave se quedó sin ninguna fuente de energía.';
    else if (comms.length === 0) lostReason = 'Todas las antenas fallaron: perdimos contacto con la nave para siempre.';

    // Sobrevuelos: la gravedad del planeta dobla la trayectoria
    const flyby = flybys.get(day);
    if (!lostReason && flyby && day < cruiseDays) {
      const name = BODIES[flyby.body].name;
      if (flyby.dvKms > POWERED_FLYBY_KMS && !isAlive(propulsion)) {
        lostReason = `Sin propulsión no pudimos hacer el encendido del sobrevuelo de ${name}: la nave se desvió para siempre.`;
      } else {
        const gain = flyby.gainKms >= 0 ? `ganó ${flyby.gainKms.toFixed(1)}` : `perdió ${(-flyby.gainKms).toFixed(1)}`;
        log(
          day,
          'good',
          `Sobrevuelo de ${name} a ${Math.round(flyby.altitudeKm).toLocaleString('es')} km: su gravedad dobló la trayectoria ${flyby.turnDeg.toFixed(0)}° y la nave ${gain} km/s respecto al Sol.`,
        );
      }
    }

    // Inserción orbital
    if (!lostReason && day === cruiseDays) {
      if (!isAlive(propulsion)) lostReason = `Sin propulsión no pudimos frenar: la nave pasó de largo junto a ${dest.name}.`;
      else if (rng() > (redundancy ? 0.99 : 0.96)) lostReason = 'La maniobra de inserción orbital falló y la nave se perdió.';
      else {
        inserted = true;
        log(
          day,
          'good',
          `¡Inserción orbital exitosa en ${dest.name}! Frenamos ${traj.insertionDvKms.toFixed(2)} km/s. Comienza la fase científica.`,
        );
      }
    }

    if (lostReason) {
      log(day, 'danger', lostReason);
      endDay = day;
      break;
    }

    // Operación científica
    const base = parts.filter((p) => p.category !== 'instrument' && alive.has(p.id)).reduce((s, p) => s + p.powerW, 0);
    let use = base;
    let downlink = 0;
    let active = 0;
    if (phase === 'ops' && geo.conjunction !== inConjunction) {
      inConjunction = geo.conjunction;
      log(
        day,
        inConjunction ? 'warning' : 'info',
        inConjunction
          ? `Conjunción solar: el Sol quedó entre la Tierra y ${dest.name}. Sin comunicación hasta que pase.`
          : 'Terminó la conjunción solar: se recupera el contacto.',
      );
    }
    if (phase === 'ops') {
      if (geo.conjunction) {
        blackoutDays++;
        conjunctionDays++;
      } else if (day <= blackoutUntil || day <= safeModeUntil) {
        blackoutDays++;
      } else {
        const instruments = parts.filter((p) => p.category === 'instrument' && alive.has(p.id));
        const link = Math.max(0, ...comms.map((c) => linkMbPerDay(c, geo.earthAU)));
        const alloc = allocate(instruments, gen - base, link, dest);
        const factor = report.eclipseFactor;
        science += alloc.science * factor;
        for (const [id, s] of Object.entries(alloc.perPart)) scienceByPart[id] = (scienceByPart[id] ?? 0) + s * factor;
        if (alloc.shed.length > 0) shedDays++;
        lostDataMb += alloc.generatedMb - alloc.returnedMb;
        use = base + alloc.usedPowerW;
        downlink = alloc.returnedMb;
        active = alloc.active.length;
      }
    }

    if (day % sampleEvery === 0 || day === totalDays) {
      samples.push({
        day,
        phase,
        powerGenW: gen,
        powerUseW: use,
        downlinkMb: downlink,
        science,
        activeInstruments: active,
        sunDistanceAU: geo.sunAU,
        earthDistanceAU: geo.earthAU,
      });
    }
  }

  if (!lostReason) log(totalDays, 'good', 'Fin de la misión nominal. ¡La nave completó su trabajo!');

  const ratio = science / dest.scienceTarget;
  const outcome: Outcome = ratio >= 1 ? 'success' : ratio >= 0.5 ? 'partial' : 'failure';
  const budgetBonus = 20 * Math.max(0, (dest.budgetM - report.totalCostM) / dest.budgetM);
  const score = Math.round(Math.min(ratio, 1.5) * 100 + (inserted ? budgetBonus : 0));

  return {
    report,
    seed,
    outcome,
    lostReason,
    inserted,
    events,
    samples,
    cruiseDays,
    totalDays,
    endDay,
    science,
    scienceByPart,
    failedParts,
    shedDays,
    blackoutDays,
    conjunctionDays,
    lostDataMb,
    score,
  };
}

