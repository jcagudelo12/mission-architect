import { useMemo, useState } from 'react';
import { mulberry32 } from '../../engine/rng';

interface GameProps {
  seed: number;
  onDone: (success: boolean, extraMinutes: number) => void;
  onCancel: () => void;
}

const REBOOT_STEPS = [
  'Desconectar las cargas no esenciales del bus principal',
  'Activar el bus de energía de respaldo',
  'Cargar el software desde la memoria protegida',
  'Verificar los sensores de Sol y giróscopos',
  'Salir del modo seguro',
];

/** Seguir una lista de verificación en orden, como en las operaciones reales */
export function SequenceGame({ seed, onDone, onCancel }: GameProps) {
  const shuffled = useMemo(() => {
    const rng = mulberry32(seed);
    return REBOOT_STEPS.map((text, i) => ({ text, i, k: rng() })).sort((a, b) => a.k - b.k);
  }, [seed]);
  const [next, setNext] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [shake, setShake] = useState<number | null>(null);

  const press = (i: number) => {
    if (i === next) {
      if (next + 1 === REBOOT_STEPS.length) onDone(true, mistakes * 2);
      else setNext(next + 1);
    } else {
      setMistakes((m) => m + 1);
      setShake(i);
      setTimeout(() => setShake(null), 400);
    }
  };

  return (
    <div className="mg">
      <h2>Reinicio de la computadora de vuelo</h2>
      <p>Sigue el procedimiento en orden. Cada error cuesta 2 minutos.</p>
      <div className="mg-seq">
        <ol className="mg-checklist">
          {REBOOT_STEPS.map((t, i) => (
            <li key={t} className={i < next ? 'done' : i === next ? 'current' : ''}>
              {t}
            </li>
          ))}
        </ol>
        <div className="mg-buttons">
          {shuffled.map((b) => (
            <button
              key={b.i}
              className={`mg-btn ${b.i < next ? 'done' : ''} ${shake === b.i ? 'shake' : ''}`}
              disabled={b.i < next}
              onClick={() => press(b.i)}
            >
              {b.text}
            </button>
          ))}
        </div>
      </div>
      <div className="mg-foot">
        <span>Errores: {mistakes}</span>
        <button className="btn ghost small" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

const SKY = 300;
const TOLERANCE_DEG = 4;

/** Girar el catálogo de estrellas hasta que coincida con lo que ve la cámara */
export function StarsGame({ seed, onDone, onCancel }: GameProps) {
  const { background, pattern, truth } = useMemo(() => {
    const rng = mulberry32(seed * 7 + 3);
    // Estrellas de fondo dentro del campo circular de la cámara
    const background = Array.from({ length: 40 }, () => {
      const ang = rng() * Math.PI * 2;
      const rad = Math.sqrt(rng()) * (SKY / 2 - 6);
      return { x: SKY / 2 + rad * Math.cos(ang), y: SKY / 2 + rad * Math.sin(ang), r: 0.6 + rng() * 1.2 };
    });
    const pattern = Array.from({ length: 6 }, (_, i) => {
      const ang = (i / 6) * Math.PI * 2 + rng() * 0.6;
      const rad = 50 + rng() * 80;
      return { x: rad * Math.cos(ang), y: rad * Math.sin(ang) };
    });
    return { background, pattern, truth: 40 + rng() * 280 };
  }, [seed]);
  const [angle, setAngle] = useState(0);
  const c = SKY / 2;
  const rot = (p: { x: number; y: number }, deg: number) => {
    const a = (deg * Math.PI) / 180;
    return { x: c + p.x * Math.cos(a) - p.y * Math.sin(a), y: c + p.x * Math.sin(a) + p.y * Math.cos(a) };
  };
  const sky = pattern.map((p) => rot(p, truth));
  const catalog = pattern.map((p) => rot(p, angle));
  const diff = Math.abs(((angle - truth + 540) % 360) - 180);
  const close = diff < 15;

  return (
    <div className="mg">
      <h2>Calibración del rastreador estelar</h2>
      <p>
        Gira el catálogo (círculos) hasta que encierre las estrellas brillantes que ve la cámara. Si confirmas mal, pierdes
        el intento.
      </p>
      <svg className="mg-sky" viewBox={`0 0 ${SKY} ${SKY}`} role="img" aria-label="Campo de estrellas del rastreador">
        <circle cx={c} cy={c} r={c - 2} className="mg-sky-bg" />
        {background.map((b, i) => (
          <circle key={i} cx={b.x} cy={b.y} r={b.r} className="mg-star dim" />
        ))}
        {sky.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} className="mg-star" />
        ))}
        <polyline points={[...catalog, catalog[0]].map((p) => `${p.x},${p.y}`).join(' ')} className="mg-catalog-line" />
        {catalog.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={8} className={`mg-catalog ${close ? 'near' : ''}`} />
        ))}
      </svg>
      <div className="mg-controls">
        <button className="btn ghost small" onClick={() => setAngle((a) => (a + 350) % 360)}>
          ⟲ 10°
        </button>
        <button className="btn ghost small" onClick={() => setAngle((a) => (a + 359) % 360)}>
          ⟲ 1°
        </button>
        <input type="range" min={0} max={359} value={Math.round(angle)} onChange={(e) => setAngle(Number(e.target.value))} aria-label="Ángulo del catálogo" />
        <button className="btn ghost small" onClick={() => setAngle((a) => (a + 1) % 360)}>
          1° ⟳
        </button>
        <button className="btn ghost small" onClick={() => setAngle((a) => (a + 10) % 360)}>
          10° ⟳
        </button>
      </div>
      <div className="mg-foot">
        <span>Ángulo: {Math.round(angle)}°</span>
        <div>
          <button className="btn ghost small" onClick={onCancel}>
            Cancelar
          </button>{' '}
          <button className="btn primary small" onClick={() => onDone(diff <= TOLERANCE_DEG, 0)}>
            Confirmar alineación
          </button>
        </div>
      </div>
    </div>
  );
}
