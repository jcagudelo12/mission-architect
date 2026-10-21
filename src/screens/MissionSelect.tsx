import { DESTINATIONS } from '../data/destinations';
import type { Destination } from '../engine/types';

interface Props {
  onSelect: (d: Destination) => void;
}

export default function MissionSelect({ onSelect }: Props) {
  return (
    <section className="screen">
      <div className="intro">
        <h1>Diseña tu misión espacial</h1>
        <p>
          Elige un destino, arma la nave pieza por pieza, escoge el cohete y sobrevive a la misión. Cada decisión
          afecta la masa, la energía, las comunicaciones y el presupuesto.
        </p>
      </div>
      <div className="dest-grid">
        {DESTINATIONS.map((d) => (
          <button key={d.id} className="dest-card" onClick={() => onSelect(d)}>
            <div className="planet" style={{ background: `radial-gradient(circle at 35% 35%, #fff8, ${d.color} 45%, #000 120%)` }} />
            <h2>{d.name}</h2>
            <div className="subtitle">{d.subtitle}</div>
            <div className="difficulty" aria-label={`Dificultad ${d.difficulty} de 3`}>
              {'●'.repeat(d.difficulty)}
              <span className="dim">{'●'.repeat(3 - d.difficulty)}</span>
            </div>
            <p>{d.description}</p>
            <dl className="facts">
              <dt>Presupuesto</dt>
              <dd>${d.budgetM} M</dd>
              <dt>Meta científica</dt>
              <dd>{d.scienceTarget.toLocaleString('es')} pts</dd>
              <dt>Viaje</dt>
              <dd>{d.cruiseDays < 30 ? `${d.cruiseDays} días` : `${(d.cruiseDays / 365).toFixed(1)} años`}</dd>
              <dt>Luz solar</dt>
              <dd>{Math.round(100 / d.sunDistanceAU ** 2)} %</dd>
              <dt>Radiación</dt>
              <dd>{d.radiation <= 1 ? 'Baja' : d.radiation < 3 ? 'Media' : 'Extrema'}</dd>
            </dl>
          </button>
        ))}
      </div>
    </section>
  );
}
