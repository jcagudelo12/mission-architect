import type { BodyId } from './orbit/bodies';

export type DestinationId = 'moon' | 'mars' | 'jupiter';

export interface Destination {
  id: DestinationId;
  name: string;
  subtitle: string;
  description: string;
  difficulty: 1 | 2 | 3;
  color: string;
  body: BodyId;
  /** Cada cuánto se abren ventanas de lanzamiento (texto para el jugador) */
  windowNote: string;
  typicalTrip: string;
  /** Distancia media al Sol (UA): define cuánta energía solar llega */
  sunDistanceAU: number;
  /** Distancia media a la Tierra (UA): estimación de comunicaciones al diseñar */
  earthDistanceAU: number;
  opsDays: number;
  /** Multiplicador de fallas por radiación (1 = entorno benigno) */
  radiation: number;
  /** Horas de sombra por día que la batería debe cubrir */
  eclipseHours: number;
  budgetM: number;
  opsCostPerYearM: number;
  scienceTarget: number;
}

export type Category = 'bus' | 'propulsion' | 'power' | 'comms' | 'instrument' | 'protection';

export interface Part {
  id: string;
  name: string;
  category: Category;
  description: string;
  massKg: number;
  costM: number;
  /** Consumo eléctrico continuo (W) */
  powerW: number;
  /** Probabilidad de falla por año en un entorno benigno */
  failPerYear: number;

  // bus
  maxInstruments?: number;
  // propulsión
  isp?: number;
  // energía
  solarW1AU?: number;
  rtgW?: number;
  batteryWh?: number;
  // comunicaciones
  gainDbi?: number;
  txPowerW?: number;
  // instrumentos
  dataMbDay?: number;
  sciencePerDay?: number;
  bestFor?: DestinationId[];
  // protección
  shield?: number;
  redundancy?: boolean;
}

export interface Rocket {
  id: string;
  name: string;
  provider: string;
  description: string;
  leoKg: number;
  costM: number;
  reliability: number;
}

export type Phase = 'launch' | 'cruise' | 'ops';
export type EventKind = 'info' | 'good' | 'warning' | 'danger';

export interface SimEvent {
  day: number;
  phase: Phase;
  kind: EventKind;
  text: string;
}

export interface Sample {
  day: number;
  phase: Phase;
  powerGenW: number;
  powerUseW: number;
  downlinkMb: number;
  science: number;
  activeInstruments: number;
  /** Distancias reales de la nave al Sol y a la Tierra (UA) */
  sunDistanceAU: number;
  earthDistanceAU: number;
}

export type Outcome = 'success' | 'partial' | 'failure';
