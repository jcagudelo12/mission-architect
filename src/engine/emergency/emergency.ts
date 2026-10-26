import { mulberry32 } from '../rng';

/**
 * Escenario de emergencia: la nave queda girando sin control tras una tormenta solar, en ruta a Marte.
 * El tiempo avanza por acciones (cada una cuesta minutos) y los recursos se consumen minuto a minuto.
 * Todo es puro: cada función devuelve un estado nuevo, así la interfaz solo dibuja.
 */

export type LoadId = 'lifesupport' | 'heaters' | 'wheels' | 'comms' | 'instruments' | 'lights';

export interface Load {
  id: LoadId;
  name: string;
  watts: number;
  hint: string;
}

/** La computadora no tiene interruptor: si se apaga, se pierde la nave */
export const COMPUTER_W = 60;

export const LOADS: Load[] = [
  { id: 'lifesupport', name: 'Soporte vital', watts: 150, hint: 'Sin él, el oxígeno se gasta 3 veces más rápido.' },
  { id: 'heaters', name: 'Calefactores', watts: 200, hint: 'Sin ellos la nave se enfría y la hidracina se congela a 2 °C.' },
  { id: 'wheels', name: 'Ruedas de reacción', watts: 80, hint: 'Mantienen la orientación. Apagadas, la nave deja de apuntar.' },
  { id: 'comms', name: 'Comunicaciones', watts: 120, hint: 'Necesarias para hablar con la Tierra.' },
  { id: 'instruments', name: 'Instrumentos científicos', watts: 120, hint: 'Apagados ahorran energía, pero se pierde ciencia.' },
  { id: 'lights', name: 'Luces y pantallas extra', watts: 40, hint: 'Comodidad. Nada crítico depende de ellas.' },
];

const WING_W = 700;
const BATTERY_MAX_WH = 2400;
/** Con la nave girando, los paneles solo ven el Sol parte del tiempo */
const SPIN_SUN_FACTOR = 0.3;
const UNPOINTED_SUN_FACTOR = 0.5;
/** Hidracina: se congela a 2 °C; las líneas dejan de servir por debajo de 3 °C */
const PROP_FREEZE_C = 3;
const CABIN_FATAL_C = -5;
/** Distancia a la Tierra en el escenario: 1.1 UA ≈ 9 minutos luz */
export const LIGHT_MINUTES = 9;
const EARTH_THINK_MIN = 10;

export type LogKind = 'info' | 'good' | 'warning' | 'danger' | 'earth';

export interface LogEntry {
  minute: number;
  kind: LogKind;
  text: string;
}

export interface EmState {
  seed: number;
  /** Cuántos números aleatorios se han usado: así el estado sigue siendo puro y repetible */
  rngDraws: number;
  minute: number;
  batteryWh: number;
  batteryMaxWh: number;
  o2Hours: number;
  tempC: number;
  propellantKg: number;
  spinDegS: number;
  computer: 'safe' | 'ok';
  wheels: 'fault' | 'ok';
  starTracker: 'uncalibrated' | 'ok';
  /** Alas de paneles solares funcionando (de 2) */
  wings: number;
  panelsPointed: boolean;
  antennaPointed: boolean;
  loads: Record<LoadId, boolean>;
  earthCall: { sentAt: number; replyAt: number } | null;
  earthReplied: boolean;
  courseCorrected: boolean;
  scienceLostMin: number;
  /** Combustible gastado en la corrección de rumbo */
  burnKg: number;
  usedThrustersForSpin: boolean;
  lostEarthReply: boolean;
  log: LogEntry[];
  outcome: null | { won: boolean; reason: string };
}

export function createInitialState(seed: number): EmState {
  return {
    seed,
    rngDraws: 0,
    minute: 0,
    batteryWh: BATTERY_MAX_WH * 0.3,
    batteryMaxWh: BATTERY_MAX_WH,
    o2Hours: 12,
    tempC: 12,
    propellantKg: 40,
    spinDegS: 3,
    computer: 'safe',
    wheels: 'fault',
    starTracker: 'uncalibrated',
    wings: 1,
    panelsPointed: false,
    antennaPointed: false,
    loads: { lifesupport: true, heaters: true, wheels: true, comms: true, instruments: true, lights: true },
    earthCall: null,
    earthReplied: false,
    courseCorrected: false,
    scienceLostMin: 0,
    burnKg: 0,
    usedThrustersForSpin: false,
    lostEarthReply: false,
    log: [
      { minute: 0, kind: 'danger', text: 'Una tormenta solar reinició la computadora. La nave gira a 3 °/s y está en modo seguro.' },
      { minute: 0, kind: 'warning', text: 'Un ala de paneles solares está dañada. La batería está al 30 % y bajando.' },
      { minute: 0, kind: 'info', text: 'Objetivo: estabilizar la nave, avisar a Control de Misión y corregir el rumbo a Marte.' },
    ],
    outcome: null,
  };
}

// --- Lecturas derivadas ---

export function generationW(s: EmState): number {
  const factor = s.spinDegS > 0 ? SPIN_SUN_FACTOR : s.panelsPointed ? 1 : UNPOINTED_SUN_FACTOR;
  return s.wings * WING_W * factor;
}

export function consumptionW(s: EmState): number {
  return COMPUTER_W + LOADS.reduce((sum, l) => sum + (s.loads[l.id] ? l.watts : 0), 0);
}

export const propellantFrozen = (s: EmState) => s.tempC < PROP_FREEZE_C;

/** El error de rumbo crece con el tiempo: cuanto más esperas, más combustible cuesta corregirlo */
export function burnCostKg(s: EmState): number {
  return (6 + 0.04 * s.minute) * (s.earthReplied ? 0.8 : 1);
}

/** Minutos que quedan hasta que la batería se agote con el consumo actual (Infinity si carga) */
export function batteryMinutesLeft(s: EmState): number {
  const net = generationW(s) - consumptionW(s);
  return net >= 0 ? Infinity : (s.batteryWh / -net) * 60;
}

export function alarms(s: EmState): string[] {
  const out: string[] = [];
  if (s.batteryWh / s.batteryMaxWh < 0.25) out.push('Batería baja');
  if (s.o2Hours < 3) out.push('Oxígeno bajo');
  if (s.tempC < 6) out.push('Temperatura baja');
  if (propellantFrozen(s)) out.push('Propelente congelado');
  if (s.spinDegS > 0) out.push('Nave girando');
  if (s.computer === 'safe') out.push('Modo seguro');
  return out;
}

// --- Acciones ---

export type ActionId =
  | 'reboot'
  | 'resetWheels'
  | 'stopSpinThrusters'
  | 'stopSpinWheels'
  | 'pointPanels'
  | 'calibrate'
  | 'eva'
  | 'pointAntenna'
  | 'callEarth'
  | 'burn'
  | 'wait';

export type Minigame = 'sequence' | 'stars';

export interface ActionView {
  id: ActionId;
  label: string;
  minutes: number;
  detail: string;
  /** Motivo por el que no se puede hacer ahora (vacío si se puede) */
  blocked: string;
  minigame?: Minigame;
  risky?: string;
}

interface Req {
  ok: boolean;
  why: string;
}

const need = (...reqs: Req[]) => reqs.find((r) => !r.ok)?.why ?? '';
const computerOk = (s: EmState): Req => ({ ok: s.computer === 'ok', why: 'Primero reinicia la computadora.' });
const notSpinning = (s: EmState): Req => ({ ok: s.spinDegS === 0, why: 'La nave sigue girando.' });
const wheelsHolding = (s: EmState): Req => ({
  ok: s.wheels === 'ok' && s.loads.wheels,
  why: s.wheels !== 'ok' ? 'Las ruedas de reacción están en falla.' : 'Enciende las ruedas de reacción.',
});
const propReady = (s: EmState): Req => ({ ok: !propellantFrozen(s), why: 'Las líneas de propelente están congeladas.' });

export function availableActions(s: EmState): ActionView[] {
  const views: ActionView[] = [];
  if (s.computer === 'safe')
    views.push({
      id: 'reboot',
      label: 'Reiniciar la computadora de vuelo',
      minutes: 10,
      detail: 'Sigue la lista de verificación para salir del modo seguro.',
      blocked: '',
      minigame: 'sequence',
    });
  if (s.wheels === 'fault')
    views.push({
      id: 'resetWheels',
      label: 'Reiniciar las ruedas de reacción',
      minutes: 20,
      detail: 'Recupera el control de orientación sin gastar combustible.',
      blocked: need(computerOk(s), { ok: s.loads.wheels, why: 'Las ruedas necesitan energía: enciende su interruptor.' }),
    });
  if (s.spinDegS > 0) {
    views.push({
      id: 'stopSpinThrusters',
      label: 'Frenar el giro con propulsores',
      minutes: 5,
      detail: 'Rápido, pero gasta 3 kg de combustible que necesitarás para corregir el rumbo.',
      blocked: need(computerOk(s), propReady(s)),
    });
    views.push({
      id: 'stopSpinWheels',
      label: 'Frenar el giro con las ruedas',
      minutes: 60,
      detail: 'No gasta combustible, pero tarda mucho mientras la batería baja.',
      blocked: need(computerOk(s), wheelsHolding(s)),
    });
  }
  if (!s.panelsPointed)
    views.push({
      id: 'pointPanels',
      label: 'Orientar los paneles al Sol',
      minutes: 10,
      detail: 'Con la nave quieta y apuntando, los paneles dan toda su potencia.',
      blocked: need(computerOk(s), notSpinning(s), wheelsHolding(s)),
    });
  if (s.starTracker !== 'ok')
    views.push({
      id: 'calibrate',
      label: 'Calibrar el rastreador estelar',
      minutes: 15,
      detail: 'Alinea el catálogo con las estrellas. Sin él no hay apuntado fino ni corrección de rumbo.',
      blocked: need(computerOk(s), notSpinning(s)),
      minigame: 'stars',
    });
  if (s.wings < 2)
    views.push({
      id: 'eva',
      label: 'Caminata espacial: reparar el ala dañada',
      minutes: 90,
      detail: 'Duplica la energía solar. Cuesta 2 horas extra de oxígeno.',
      blocked: need(computerOk(s), { ok: s.o2Hours > 3.5, why: 'No queda oxígeno suficiente para salir.' }),
      risky: s.spinDegS > 0 ? 'Con la nave girando hay 50 % de probabilidad de fallar.' : undefined,
    });
  if (!s.antennaPointed)
    views.push({
      id: 'pointAntenna',
      label: 'Apuntar la antena a la Tierra',
      minutes: 10,
      detail: 'Necesita apuntado fino: rastreador estelar calibrado y nave estable.',
      blocked: need(
        computerOk(s),
        notSpinning(s),
        wheelsHolding(s),
        { ok: s.starTracker === 'ok', why: 'Calibra el rastreador estelar.' },
        { ok: s.loads.comms, why: 'Enciende las comunicaciones.' },
      ),
    });
  if (!s.earthReplied)
    views.push({
      id: 'callEarth',
      label: 'Llamar a Control de Misión',
      minutes: 5,
      detail: `La señal tarda ${LIGHT_MINUTES} min en llegar y otros ${LIGHT_MINUTES} en volver. Mantén la antena apuntando.`,
      blocked: need(
        { ok: !s.earthCall, why: 'Ya enviaste el mensaje; espera la respuesta.' },
        { ok: s.antennaPointed, why: 'Apunta la antena a la Tierra.' },
        { ok: s.loads.comms, why: 'Enciende las comunicaciones.' },
      ),
    });
  if (!s.courseCorrected)
    views.push({
      id: 'burn',
      label: 'Encender el motor: corrección de rumbo',
      minutes: 15,
      detail: `Hoy cuesta ${burnCostKg(s).toFixed(1)} kg y sube con cada minuto.${s.earthReplied ? ' Usa el plan de la Tierra (−20 %).' : ''}`,
      blocked: need(
        computerOk(s),
        notSpinning(s),
        wheelsHolding(s),
        { ok: s.starTracker === 'ok', why: 'Sin el rastreador estelar no sabes hacia dónde empujar.' },
        propReady(s),
        { ok: s.propellantKg >= burnCostKg(s), why: 'No alcanza el combustible.' },
      ),
    });
  views.push({ id: 'wait', label: 'Esperar 30 minutos', minutes: 30, detail: 'Deja que la batería cargue (o que se descargue).', blocked: '' });
  return views;
}

// --- Motor de tiempo ---

function draw(s: EmState): [number, EmState] {
  const rng = mulberry32(s.seed);
  let v = 0;
  for (let i = 0; i <= s.rngDraws; i++) v = rng();
  return [v, { ...s, rngDraws: s.rngDraws + 1 }];
}

function log(s: EmState, kind: LogKind, text: string): EmState {
  return { ...s, log: [...s.log, { minute: s.minute, kind, text }] };
}

/** Avanza el reloj minuto a minuto: energía, oxígeno, temperatura, mensajes de la Tierra y condiciones de derrota */
export function advance(state: EmState, minutes: number): EmState {
  let s = state;
  for (let i = 0; i < minutes && !s.outcome; i++) {
    const net = generationW(s) - consumptionW(s);
    const batteryWh = Math.min(s.batteryMaxWh, Math.max(0, s.batteryWh + net / 60));
    const o2Hours = Math.max(0, s.o2Hours - (s.loads.lifesupport ? 1 : 3) / 60);
    const tempC = s.loads.heaters ? Math.min(21, s.tempC + 0.03) : s.tempC - 0.05;
    const wasFrozen = propellantFrozen(s);
    s = {
      ...s,
      minute: s.minute + 1,
      batteryWh,
      o2Hours,
      tempC,
      scienceLostMin: s.scienceLostMin + (s.loads.instruments ? 0 : 1),
    };
    if (!wasFrozen && propellantFrozen(s)) s = log(s, 'danger', 'La temperatura bajó de 3 °C: las líneas de hidracina se congelaron.');
    if (wasFrozen && !propellantFrozen(s)) s = log(s, 'good', 'Las líneas de propelente se descongelaron.');

    if (s.earthCall && s.minute >= s.earthCall.replyAt) {
      if (s.antennaPointed && s.loads.comms) {
        s = log(
          { ...s, earthCall: null, earthReplied: true },
          'earth',
          'Control de Misión: "Recibimos su estado. Les enviamos la maniobra de corrección calculada en tierra: ahorra 20 % de combustible."',
        );
      } else {
        s = log(
          { ...s, earthCall: null, lostEarthReply: true },
          'warning',
          'La respuesta de la Tierra llegó, pero la antena no estaba apuntando o las comunicaciones estaban apagadas. Mensaje perdido.',
        );
      }
    }

    if (s.batteryWh <= 0) s = { ...s, outcome: { won: false, reason: 'Apagón total: la batería se agotó, la computadora se apagó y la nave quedó muerta.' } };
    else if (s.o2Hours <= 0) s = { ...s, outcome: { won: false, reason: 'Se acabó el oxígeno.' } };
    else if (s.tempC <= CABIN_FATAL_C) s = { ...s, outcome: { won: false, reason: 'La cabina se congeló.' } };
    else if (!s.courseCorrected && burnCostKg(s) > s.propellantKg)
      s = {
        ...s,
        outcome: { won: false, reason: 'El error de rumbo creció tanto que ya no alcanza el combustible para llegar a Marte.' },
      };
  }
  if (s.outcome && !state.outcome) s = log(s, 'danger', s.outcome.reason);
  return s;
}

/** Cambia un interruptor. Apagar las ruedas hace que la nave deje de apuntar. */
export function toggleLoad(state: EmState, id: LoadId): EmState {
  if (state.outcome) return state;
  const on = !state.loads[id];
  let s: EmState = { ...state, loads: { ...state.loads, [id]: on } };
  const load = LOADS.find((l) => l.id === id)!;
  s = log(s, 'info', `${load.name}: ${on ? 'encendido' : 'apagado'} (${on ? '+' : '−'}${load.watts} W).`);
  if (id === 'wheels' && !on && (s.panelsPointed || s.antennaPointed)) {
    s = log({ ...s, panelsPointed: false, antennaPointed: false }, 'warning', 'Sin ruedas de reacción la nave se desvía: paneles y antena dejaron de apuntar.');
  }
  return s;
}

/**
 * Ejecuta una acción. Para las que tienen minijuego, `success` dice si se superó
 * y `extraMinutes` suma el tiempo perdido en errores.
 */
export function perform(state: EmState, id: ActionId, opts: { success?: boolean; extraMinutes?: number } = {}): EmState {
  if (state.outcome) return state;
  const view = availableActions(state).find((a) => a.id === id);
  if (!view || view.blocked) return state;
  const success = opts.success ?? true;
  let s = advance(state, view.minutes + (opts.extraMinutes ?? 0));
  if (s.outcome) return s;

  switch (id) {
    case 'reboot':
      s = success
        ? log({ ...s, computer: 'ok' }, 'good', 'Computadora en línea: salimos del modo seguro.')
        : log(s, 'warning', 'Secuencia de reinicio incorrecta. La computadora sigue en modo seguro.');
      break;
    case 'resetWheels':
      s = log({ ...s, wheels: 'ok' }, 'good', 'Ruedas de reacción reiniciadas: tenemos control de orientación.');
      break;
    case 'stopSpinThrusters':
      s = log(
        { ...s, spinDegS: 0, propellantKg: s.propellantKg - 3, usedThrustersForSpin: true },
        'good',
        'Propulsores encendidos: la nave dejó de girar (−3 kg de combustible).',
      );
      break;
    case 'stopSpinWheels':
      s = log({ ...s, spinDegS: 0 }, 'good', 'Las ruedas absorbieron el giro: la nave está quieta sin gastar combustible.');
      break;
    case 'pointPanels':
      s = log({ ...s, panelsPointed: true }, 'good', 'Paneles apuntando al Sol: potencia máxima.');
      break;
    case 'calibrate':
      s = success
        ? log({ ...s, starTracker: 'ok' }, 'good', 'Rastreador estelar calibrado: sabemos exactamente hacia dónde apuntamos.')
        : log(s, 'warning', 'La calibración no coincidió con el catálogo. Hay que intentarlo de nuevo.');
      break;
    case 'eva': {
      let fail = false;
      if (state.spinDegS > 0) {
        const [r, next] = draw(s);
        s = next;
        fail = r < 0.5;
      }
      s = { ...s, o2Hours: Math.max(0, s.o2Hours - 2) };
      s = fail
        ? log(s, 'danger', 'Con la nave girando no pudiste sujetarte al ala. Volviste sin repararla y con 2 h menos de oxígeno.')
        : log({ ...s, wings: 2 }, 'good', 'Ala reparada: los paneles vuelven a dar toda su potencia (−2 h de oxígeno).');
      break;
    }
    case 'pointAntenna':
      s = log({ ...s, antennaPointed: true }, 'good', 'Antena de alta ganancia apuntando a la Tierra.');
      break;
    case 'callEarth':
      s = log(
        { ...s, earthCall: { sentAt: s.minute, replyAt: s.minute + 2 * LIGHT_MINUTES + EARTH_THINK_MIN } },
        'earth',
        `Mensaje enviado. Llegará a la Tierra en ${LIGHT_MINUTES} min; la respuesta tardará al menos ${2 * LIGHT_MINUTES + EARTH_THINK_MIN} min.`,
      );
      break;
    case 'burn': {
      const cost = burnCostKg(state);
      s = log(
        { ...s, courseCorrected: true, propellantKg: s.propellantKg - cost, burnKg: cost },
        'good',
        `Corrección de rumbo completada con ${cost.toFixed(1)} kg de combustible. ¡De vuelta en ruta a Marte!`,
      );
      break;
    }
    case 'wait':
      break;
  }

  if (!s.outcome && s.courseCorrected && s.earthReplied)
    s = log(
      { ...s, outcome: { won: true, reason: 'Nave estabilizada, Control de Misión informado y rumbo corregido.' } },
      'good',
      '¡Emergencia superada!',
    );
  return s;
}

export function score(s: EmState): number {
  if (!s.outcome?.won) return 0;
  return Math.max(
    0,
    Math.round(
      500 +
        s.o2Hours * 20 +
        s.propellantKg * 10 +
        (s.batteryWh / s.batteryMaxWh) * 200 -
        s.minute * 0.5 -
        s.scienceLostMin * 0.3,
    ),
  );
}

export function lessons(s: EmState): string[] {
  const out: string[] = [];
  if (s.usedThrustersForSpin)
    out.push('Frenaste el giro con propulsores: rápido, pero ese combustible ya no está para corregir el rumbo. Las ruedas no gastan combustible, pero tardan.');
  else if (s.spinDegS === 0) out.push('Frenaste el giro con las ruedas de reacción y guardaste el combustible para lo importante.');
  if (s.lostEarthReply)
    out.push(`La respuesta de la Tierra se perdió. Con ${LIGHT_MINUTES} minutos luz de distancia, hay que mantener la antena apuntando todo el viaje de ida y vuelta.`);
  if (s.log.some((l) => l.text.includes('se congelaron')))
    out.push('Apagar los calefactores ahorra 200 W, pero la hidracina se congela a 2 °C. En la nave todo está conectado.');
  if (s.scienceLostMin > 60)
    out.push(`Los instrumentos estuvieron apagados ${s.scienceLostMin} minutos. A veces sacrificar ciencia salva la misión.`);
  if (s.wings < 2) out.push('No reparaste el ala: con la mitad de la energía solar, cualquier otro problema habría sido fatal.');
  if (s.outcome?.won && s.minute < 240) out.push('Resolviste la emergencia en menos de 4 horas: priorizaste bien.');
  if (!s.outcome?.won && s.outcome?.reason.includes('batería'))
    out.push('El primer recurso que se acaba suele ser la energía: apaga lo que no es esencial y deja de girar para que los paneles carguen.');
  return out;
}
