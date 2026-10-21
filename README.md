# 🛰️ Mission Architect

Demo de un juego para el **NASA Space Apps Challenge**: diseña, lanza y opera una misión espacial completa
tomando decisiones de ingeniería con recursos limitados (masa, energía, datos, presupuesto, radiación).

## Cómo jugar

1. **Concepto:** elige un destino (Luna, Marte o Júpiter). Cada uno tiene presupuesto, meta científica y entorno distintos.
2. **Diseño:** arma la nave (bus, propulsión, energía, antenas, instrumentos y protección). El panel lateral muestra en vivo
   el costo, la masa, la energía, los datos y la ciencia estimada.
3. **Lanzamiento:** elige el cohete. La capacidad hacia el destino es mucho menor que a la órbita baja.
4. **Operación:** la misión se simula día a día con fallas y eventos aleatorios (tormentas solares, micrometeoritos, modo seguro…).
5. **Resultados:** puntaje, ciencia por instrumento y "lecciones de ingeniería" según lo que pasó.

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
    destinations.ts   destinos (distancias, Δv, radiación, presupuesto, meta)
    rockets.ts        cohetes (capacidad a LEO, costo, confiabilidad)
    parts.ts          piezas de la nave (masa, costo, potencia, datos, ciencia…)
  engine/        ← lógica pura en TypeScript, sin React
    design.ts         presupuestos: Tsiolkovsky, energía solar, enlace de datos, validaciones
    simulation.ts     simulación día a día con eventos aleatorios y semilla
    rng.ts            generador aleatorio con semilla (misma semilla = misma misión)
    types.ts
  screens/       ← una pantalla por fase del juego
  ui/            ← componentes reutilizables (medidores, panel de presupuesto, vista orbital)
```

## Modelos usados (simplificados)

| Sistema | Modelo |
|---|---|
| Combustible | Ecuación de Tsiolkovsky: Δv = Isp · g₀ · ln(m₀ / m_f), más 10 % de masa de tanques |
| Energía solar | P = P₁UA · 0.85 / r² (la luz cae con el cuadrado de la distancia al Sol) |
| Comunicaciones | tasa ∝ P_tx · G_antena / d², 4 h diarias de contacto con la DSN |
| Ciencia | Los instrumentos se encienden por ciencia/W y los datos se envían por ciencia/Mb |
| Fallas | Tasa anual por pieza × radiación del destino, reducida por el blindaje |

Los valores numéricos son aproximados y están ajustados para que el juego sea divertido, no para diseñar misiones reales.

## Ideas para seguir iterando

- Modo "recrea una misión real" (LRO, MRO, Juno) comparando el diseño del jugador con el real
- Decisiones del jugador durante la operación (p. ej. "¿apagar un instrumento para salvar energía?")
- Vista 3D con React Three Fiber y modelos de [NASA 3D Resources](https://science.nasa.gov/3d-resources/)
- Más destinos: asteroide, Europa, telescopio en L2
- Ventanas de lanzamiento y trayectorias con asistencia gravitatoria
- Gráficas de energía y ciencia a lo largo de la misión
- Tutorial guiado para la primera misión
