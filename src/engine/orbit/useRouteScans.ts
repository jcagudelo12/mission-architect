import { useEffect, useState } from 'react';
import type { Route, WindowPoint } from './transfer';

// Los resultados no cambian entre partidas: se guardan para no recalcular al volver a esta pantalla
const cache = new Map<string, WindowPoint[]>();

/** Lanza un worker por ruta y devuelve los puntos de cada una a medida que terminan */
export function useRouteScans(routes: Route[]): Record<string, WindowPoint[] | undefined> {
  const [scans, setScans] = useState<Record<string, WindowPoint[] | undefined>>(() =>
    Object.fromEntries(routes.map((r) => [r.id, cache.get(r.id)])),
  );

  useEffect(() => {
    const workers: Worker[] = [];
    for (const route of routes) {
      if (cache.has(route.id)) continue;
      const worker = new Worker(new URL('./scan.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<{ routeId: string; points: WindowPoint[] }>) => {
        cache.set(e.data.routeId, e.data.points);
        setScans((s) => ({ ...s, [e.data.routeId]: e.data.points }));
        worker.terminate();
      };
      worker.postMessage({ routeId: route.id });
      workers.push(worker);
    }
    return () => workers.forEach((w) => w.terminate());
  }, [routes]);

  return scans;
}
