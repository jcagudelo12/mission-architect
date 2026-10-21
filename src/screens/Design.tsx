import { useMemo } from 'react';
import { CATEGORY_LABELS, CATEGORY_ORDER, PARTS, PARTS_BY_ID, SINGLE_CHOICE } from '../data/parts';
import { analyzeDesign, fmtMb, linkMbPerDay, scienceMultiplier, solarW } from '../engine/design';
import type { Destination, Part, Rocket } from '../engine/types';
import BudgetPanel from '../ui/BudgetPanel';

interface Props {
  dest: Destination;
  selection: string[];
  rocket?: Rocket;
  onChange: (ids: string[]) => void;
  onBack: () => void;
  onNext: () => void;
}

export default function Design({ dest, selection, rocket, onChange, onBack, onNext }: Props) {
  const report = useMemo(() => analyzeDesign(dest, selection, rocket), [dest, selection, rocket]);
  // En esta pantalla solo bloquean los errores de diseño; masa vs cohete se revisa al lanzar
  const designErrors = useMemo(() => analyzeDesign(dest, selection).errors, [dest, selection]);

  const toggle = (part: Part) => {
    if (selection.includes(part.id)) {
      onChange(selection.filter((id) => id !== part.id));
    } else if (SINGLE_CHOICE.includes(part.category)) {
      onChange([...selection.filter((id) => PARTS_BY_ID[id]?.category !== part.category), part.id]);
    } else {
      onChange([...selection, part.id]);
    }
  };

  return (
    <section className="screen design">
      <div className="catalog">
        <div className="screen-head">
          <h1>Diseña la nave</h1>
          <p>
            Destino: <strong>{dest.name}</strong>. Cada pieza suma masa, costo y consumo. Mira el panel de la derecha:
            ahí ves en vivo cómo cada decisión afecta a las demás.
          </p>
        </div>
        {CATEGORY_ORDER.map((cat) => (
          <div key={cat} className="category">
            <h2>
              {CATEGORY_LABELS[cat]}
              {SINGLE_CHOICE.includes(cat) && <span className="tag">elige una</span>}
            </h2>
            <div className="parts">
              {PARTS.filter((p) => p.category === cat).map((p) => (
                <PartCard key={p.id} part={p} dest={dest} selected={selection.includes(p.id)} onClick={() => toggle(p)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="side">
        <BudgetPanel dest={dest} report={report} />
        <div className="actions">
          <button className="btn ghost" onClick={onBack}>
            ← Destino
          </button>
          <button className="btn primary" disabled={designErrors.length > 0} onClick={onNext}>
            Elegir cohete →
          </button>
        </div>
      </div>
    </section>
  );
}

function PartCard({ part: p, dest, selected, onClick }: { part: Part; dest: Destination; selected: boolean; onClick: () => void }) {
  const stats: string[] = [`${p.massKg} kg`, `$${p.costM} M`];
  if (p.powerW) stats.push(`−${p.powerW} W`);
  if (p.maxInstruments) stats.push(`${p.maxInstruments} instrumentos`);
  if (p.isp) stats.push(`Isp ${p.isp} s`);
  if (p.solarW1AU) stats.push(`+${Math.round(solarW(p, dest.sunDistanceAU))} W aquí`);
  if (p.rtgW) stats.push(`+${p.rtgW} W siempre`);
  if (p.batteryWh) stats.push(`${p.batteryWh} Wh`);
  if (p.gainDbi) stats.push(`${fmtMb(linkMbPerDay(p, dest.earthDistanceAU))}/día aquí`);
  if (p.dataMbDay) stats.push(`${fmtMb(p.dataMbDay)}/día`);
  if (p.sciencePerDay) stats.push(`${(p.sciencePerDay * scienceMultiplier(p, dest)).toFixed(1)} pts/día`);
  if (p.shield) stats.push(`blindaje ${p.shield * 100} %`);
  const ideal = p.bestFor?.includes(dest.id);

  return (
    <button className={`part ${selected ? 'selected' : ''}`} onClick={onClick} aria-pressed={selected}>
      <div className="part-head">
        <strong>{p.name}</strong>
        {ideal && <span className="tag good">★ ideal aquí</span>}
      </div>
      <p>{p.description}</p>
      <div className="chips">
        {stats.map((s) => (
          <span key={s} className="chip">
            {s}
          </span>
        ))}
      </div>
    </button>
  );
}
