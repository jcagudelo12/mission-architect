import { fmtMb, type DesignReport } from '../engine/design';
import type { Destination } from '../engine/types';
import Meter from './Meter';

interface Props {
  dest: Destination;
  report: DesignReport;
}

export default function BudgetPanel({ dest, report: r }: Props) {
  return (
    <aside className="panel budget">
      <h3>Presupuestos de la misión</h3>
      <Meter
        label="Costo total"
        value={r.totalCostM}
        max={dest.budgetM}
        unit="M USD"
        hint={`Piezas $${Math.round(r.partsCostM)} M + cohete $${r.rocketCostM} M + operaciones $${Math.round(r.opsCostM)} M`}
      />
      {r.capacityKg !== undefined ? (
        <Meter label="Masa al lanzar" value={r.wetMassKg} max={r.capacityKg} unit="kg" />
      ) : (
        <div className="stat-line">
          <span>Masa al lanzar</span>
          <strong>{Number.isFinite(r.wetMassKg) ? Math.round(r.wetMassKg).toLocaleString('es') : '∞'} kg</strong>
        </div>
      )}
      <div className="stat-sub">
        Seca {Math.round(r.dryMassKg)} kg + combustible {Number.isFinite(r.propellantKg) ? Math.round(r.propellantKg) : '∞'} kg para Δv{' '}
        {r.deltaVKms.toFixed(2)} km/s
      </div>
      <Meter
        label={`Energía en ${dest.name}`}
        value={r.powerUseW}
        max={r.powerGenW}
        unit="W"
        hint="Consumo con todo encendido / potencia generada en el destino"
      />
      <Meter
        label="Datos por día"
        value={r.dataGenMbDay}
        max={r.downlinkMbDay}
        format={fmtMb}
        hint="Datos generados / capacidad de envío a la Tierra"
      />
      <Meter
        label="Instrumentos"
        value={r.instruments.length}
        max={r.bus?.maxInstruments ?? 0}
        format={(n) => String(n)}
      />
      <Meter
        label="Ciencia estimada"
        value={r.estimatedScience}
        max={dest.scienceTarget}
        unit="pts"
        mode="over"
        hint="Si todo funciona perfecto durante la misión"
      />

      {(r.errors.length > 0 || r.warnings.length > 0) && (
        <ul className="issues">
          {r.errors.map((e) => (
            <li key={e} className="error">
              {e}
            </li>
          ))}
          {r.warnings.map((w) => (
            <li key={w} className="warning">
              {w}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
