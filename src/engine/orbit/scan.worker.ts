import { findRoute, scanRoute } from './transfer';

// Explorar años de fechas de lanzamiento toma unos segundos: lo hacemos fuera del hilo de la interfaz
const ctx = self as unknown as {
  onmessage: (e: MessageEvent<{ routeId: string }>) => void;
  postMessage: (message: unknown) => void;
};

ctx.onmessage = (e) => {
  const route = findRoute(e.data.routeId);
  if (!route) return;
  ctx.postMessage({ routeId: route.id, points: scanRoute(route) });
};
