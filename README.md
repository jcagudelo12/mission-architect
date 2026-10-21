# 🛰️ Mission Architect

Demo de un juego para el **NASA Space Apps Challenge**: diseña, lanza y opera una misión espacial completa
tomando decisiones de ingeniería con recursos limitados (masa, energía, datos, presupuesto, radiación).

## Cómo jugar

1. **Concepto:** elige un destino (Luna, Marte o Júpiter). Cada uno tiene presupuesto, meta científica y entorno distintos.
2. **Trayectoria:** elige la ruta (directa o con asistencia gravitatoria) y la fecha de salida en el gráfico de ventanas
   de lanzamiento y en el mapa *porkchop*. Las posiciones de los planetas son reales (2027-2036).
3. **Diseño:** arma la nave (bus, propulsión, energía, antenas, instrumentos y protección). El panel lateral muestra en vivo
   el costo, la masa, la energía, los datos y la ciencia estimada.
4. **Lanzamiento:** elige el cohete. Cuanta más energía (C3) pida la trayectoria, menos masa puede enviar.
5. **Operación:** la nave sigue la trayectoria real, con sobrevuelos e inserción orbital animados, conjunciones solares
   y fallas y eventos aleatorios (tormentas solares, micrometeoritos, modo seguro…).
6. **Resultados:** puntaje, ciencia por instrumento y "lecciones de ingeniería" según lo que pasó.

## Requisitos (Mac, Windows y Linux)

- [Node.js](https://nodejs.org/) 20.19 o superior (recomendado: la versión de `.nvmrc`).
  - Mac/Linux: [`fnm`](https://github.com/Schniz/fnm) o [`nvm`](https://github.com/nvm-sh/nvm)
  - Windows: [`fnm`](https://github.com/Schniz/fnm) o el instalador oficial
- Git

## Arrancar

```bash
npm install
npm run dev
```

Abre http://localhost:5173. Vite recarga la página automáticamente al guardar cambios.

Otros comandos:

| Comando | Qué hace |
|---|---|
| `npm run typecheck` | Revisa los tipos de TypeScript |
| `npm run build` | Genera la versión de producción en `dist/` |
| `npm run preview` | Sirve `dist/` para probar el build |

## Estructura

```
src/
  data/          ← contenido del juego: aquí se balancea sin tocar la lógica
    destinations.ts   destinos (distancias, radiación, presupuesto, meta científica)
    rockets.ts        cohetes (capacidad a LEO, costo, confiabilidad)
    parts.ts          piezas de la nave (masa, costo, potencia, datos, ciencia…)
  engine/        ← lógica pura en TypeScript, sin React
    design.ts         presupuestos: Tsiolkovsky, energía solar, enlace de datos, validaciones
    simulation.ts     simulación día a día con eventos aleatorios y semilla
    rng.ts            generador aleatorio con semilla (misma semilla = misma misión)
    types.ts
    orbit/            ← mecánica orbital
      bodies.ts         constantes de planetas y efemérides reales (astronomy-engine)
      kepler.ts         problema de Lambert y propagación kepleriana (variables universales)
      transfer.ts       rutas, sobrevuelos, búsqueda de ventanas y mapa porkchop
      scan.worker.ts    explora miles de fechas en un Web Worker para no congelar la página
  screens/       ← una pantalla por fase del juego
  ui/            ← componentes reutilizables (medidores, panel de presupuesto, vista orbital)
```

## Modelos usados (simplificados)

| Sistema | Modelo |
|---|---|
| Trayectorias | Cónicas empalmadas: arcos de Kepler alrededor del Sol (o de la Tierra para la Luna) resueltos con el problema de Lambert entre posiciones reales de los planetas |
| Sobrevuelos | El giro máximo depende de qué tan cerca pase la nave; si v∞ de entrada y salida no coinciden, se paga la diferencia con un encendido en el periapsis |
| Lanzamiento | Capacidad del cohete = carga a LEO · 0.3 · e^(−C3/50) (curva simplificada) |
| Inserción orbital | Δv para pasar de la hipérbola de llegada a la órbita de captura (como MRO o Juno) |
| Combustible | Ecuación de Tsiolkovsky: Δv = Isp · g₀ · ln(m₀ / m_f), más 10 % de masa de tanques |
| Energía solar | P = P₁UA · 0.85 / r² (la luz cae con el cuadrado de la distancia al Sol) |
| Comunicaciones | tasa ∝ P_tx · G_antena / d² con la distancia real Tierra-nave, 4 h diarias de contacto con la DSN; sin señal en conjunción solar (< 2°) |
| Ciencia | Los instrumentos se encienden por ciencia/W y los datos se envían por ciencia/Mb |
| Fallas | Tasa anual por pieza × radiación del destino, reducida por el blindaje |

Los valores numéricos son aproximados y están ajustados para que el juego sea divertido, no para diseñar misiones reales.

## Ideas para seguir iterando

- Modo "recrea una misión real" (LRO, MRO, Juno) comparando el diseño del jugador con el real
- Decisiones del jugador durante la operación (p. ej. "¿apagar un instrumento para salvar energía?")
- Vista 3D con React Three Fiber y modelos de [NASA 3D Resources](https://science.nasa.gov/3d-resources/)
- Más destinos: asteroide, Europa, telescopio en L2
- Más rutas: Venus-Tierra-Tierra (como Galileo) o maniobras en el espacio profundo con sobrevuelo de la Tierra (como Juno)
- Propulsión eléctrica de bajo empuje (como Psyche o Dawn), que necesita un modelo de trayectoria distinto
- Gráficas de energía y ciencia a lo largo de la misión
- Tutorial guiado para la primera misión
