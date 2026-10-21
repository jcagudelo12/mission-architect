import type { Rocket } from '../engine/types';

// Capacidad a órbita baja (LEO) y costos aproximados; la capacidad hacia cada destino
// depende de la energía de salida (C3) de la trayectoria elegida.
export const ROCKETS: Rocket[] = [
  {
    id: 'electron',
    name: 'Electron',
    provider: 'Rocket Lab',
    description: 'Minilanzador para cubesats. Llevó la sonda CAPSTONE (25 kg) a la Luna.',
    leoKg: 300,
    costM: 8,
    reliability: 0.93,
  },
  {
    id: 'falcon9',
    name: 'Falcon 9',
    provider: 'SpaceX',
    description: 'El caballo de batalla: barato y muy confiable.',
    leoKg: 22800,
    costM: 70,
    reliability: 0.99,
  },
  {
    id: 'vulcan',
    name: 'Vulcan Centaur',
    provider: 'ULA',
    description: 'Etapa superior Centaur, muy eficiente para salir de la órbita terrestre.',
    leoKg: 27200,
    costM: 115,
    reliability: 0.97,
  },
  {
    id: 'falconheavy',
    name: 'Falcon Heavy',
    provider: 'SpaceX',
    description: 'Tres núcleos de Falcon 9. Lanzó Psyche y Europa Clipper.',
    leoKg: 63800,
    costM: 150,
    reliability: 0.98,
  },
  {
    id: 'sls',
    name: 'SLS Block 1',
    provider: 'NASA',
    description: 'El cohete más potente de NASA. Enorme capacidad... y enorme precio.',
    leoKg: 95000,
    costM: 2200,
    reliability: 0.95,
  },
];
