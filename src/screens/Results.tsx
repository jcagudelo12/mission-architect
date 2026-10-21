import { PARTS_BY_ID } from '../data/parts';
import { fmtMb } from '../engine/design';
import { BODIES } from '../engine/orbit/bodies';
import type { SimResult } from '../engine/simulation';
import type { Destination } from '../engine/types';
import Meter from '../ui/Meter';

interface Props {
  dest: Destination;
  sim: SimResult;
  onRedesign: () => void;
  onRetry: () => void;
  onNewMission: () => void;
}

const OUTCOME = {
  success: { title: '¡Misión exitosa!', cls: 'ok' },
  partial: { title: 'Éxito parcial', cls: 'warn' },
  failure: { title: 'Misión fallida', cls: 'bad' },
};

export default function Results({ dest, sim, onRedesign, onRetry, onNewMission }: Props) {
  const r = sim.report;
  const o = OUTCOME[sim.outcome];
  const byPart = Object.entries(sim.scienceByPart).sort((a, b) => b[1] - a[1]);
  const lessons = buildLessons(dest, sim);

  return (
    <section className="screen results">
      <div className={`result-hero ${o.cls}`}>
        <div>
          <h1>{o.title}</h1>
          {sim.lostReason && <p>{sim.lostReason}</p>}
        </div>
        <div className="score">
          <span>{sim.score}</span>
          <small>puntos</small>
        </div>
      </div>

      <div className="results-grid">
        <div className="panel">
          <h3>Resumen</h3>
          <Meter label="Ciencia obtenida" value={sim.science} max={dest.scienceTarget} unit="pts" mode="over" />
          <Meter label="Costo" value={r.totalCostM} max={dest.budgetM} unit="M USD" />
          <div className="stat-line">
            <span>Días de operación</span>
            <strong>{Math.max(0, sim.endDay - sim.cruiseDays)} / {dest.opsDays}</strong>
          </div>
          <div className="stat-line">
            <span>Días sin contacto o en modo seguro</span>
            <strong>{sim.blackoutDays}</strong>
          </div>
          <div className="stat-line">
            <span>Días de conjunción solar</span>
            <strong>{sim.conjunctionDays}</strong>
          </div>
          <div className="stat-line">
            <span>Datos que no se pudieron enviar</span>
            <strong>{fmtMb(sim.lostDataMb)}</strong>
          </div>
          <div className="stat-line">
            <span>Semilla</span>
            <strong>{sim.seed}</strong>
          </div>
        </div>

        <div className="panel">
          <h3>Ciencia por instrumento</h3>
          {byPart.length === 0 && <p className="dim">No se obtuvo ciencia.</p>}
          {byPart.map(([id, s]) => (
            <div key={id} className="stat-line">
              <span>{PARTS_BY_ID[id]?.name}</span>
              <strong>{Math.round(s).toLocaleString('es')} pts</strong>
            </div>
          ))}
          {sim.failedParts.length > 0 && (
            <>
              <h3>Piezas que fallaron</h3>
              <ul className="plain">
                {sim.failedParts.map((p) => (
                  <li key={p.id}>{p.name}</li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="panel lessons">
          <h3>Lecciones de ingeniería</h3>
          <ul>
            {lessons.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="actions center">
        <button className="btn primary" onClick={onRedesign}>
          🔧 Rediseñar
        </button>
        <button className="btn ghost" onClick={onRetry}>
          🎲 Volar el mismo diseño otra vez
        </button>
        <button className="btn ghost" onClick={onNewMission}>
          🌍 Nueva misión
        </button>
      </div>
    </section>
  );
}

function buildLessons(dest: Destination, sim: SimResult): string[] {
  const r = sim.report;
  const t = r.trajectory;
  const out: string[] = [];
  for (const f of t.flybys)
    out.push(
      `El sobrevuelo de ${BODIES[f.body].name} dobló tu trayectoria ${f.turnDeg.toFixed(0)}° y cambió tu velocidad ${f.gainKms >= 0 ? '+' : ''}${f.gainKms.toFixed(1)} km/s respecto al Sol sin gastar combustible: eso es una asistencia gravitatoria.`,
    );
  if (t.c3 > 60)
    out.push(
      `Tu trayectoria pedía un C3 de ${t.c3.toFixed(0)} km²/s²: por eso el cohete solo podía llevar ${r.capacityKg?.toLocaleString('es')} kg.` +
        (t.flybys.length === 0 ? ' Las rutas con asistencia gravitatoria bajan el C3.' : ''),
    );
  if (sim.lostReason?.includes('propulsión'))
    out.push(
      `El motor falló durante ${Math.round(t.tofDays)} días de crucero. Cuanto más largo el viaje, más desgaste: una trayectoria más corta o la redundancia reducen ese riesgo.`,
    );
  if (sim.conjunctionDays > 0)
    out.push(
      `Pasaste ${sim.conjunctionDays} días en conjunción solar: el Sol bloqueaba la señal. Las misiones reales planean estas pausas con anticipación.`,
    );
  if (r.dataGenMbDay > r.downlinkMbDay)
    out.push(
      `Tus instrumentos generaban ${fmtMb(r.dataGenMbDay)}/día pero la antena solo enviaba ${fmtMb(r.downlinkMbDay)}/día: se quedaron ${fmtMb(sim.lostDataMb)} sin enviar. La tasa de datos cae con el cuadrado de la distancia: una antena más grande puede valer más que otro instrumento.`,
    );
  if (r.powerUseW > r.powerGenW)
    out.push(
      `Generabas ${Math.round(r.powerGenW)} W en ${dest.name} pero necesitabas ${Math.round(r.powerUseW)} W: algunos instrumentos pasaron la misión apagados.`,
    );
  else if (r.powerGenW > 0 && (r.powerGenW - r.powerUseW) / r.powerGenW < 0.1)
    out.push('Tu margen de energía era menor al 10 %. Las misiones reales dejan 20-30 % para la degradación y los imprevistos.');
  if (r.eclipseFactor < 1) out.push('Sin batería suficiente, los instrumentos se apagaban en cada eclipse.');
  const radiationFailures = sim.failedParts.length > 0 && dest.radiation > 2;
  if (radiationFailures && r.shield < 0.8)
    out.push('La radiación dañó la electrónica. Juno lleva una bóveda de titanio de 200 kg justo por esto.');
  if (sim.lostReason?.includes('antenas'))
    out.push('Una antena de respaldo pesa poco y puede salvar la misión entera.');
  if (sim.lostReason?.includes('computadora'))
    out.push('La redundancia cuesta masa y dinero, pero reduce el riesgo de perderlo todo por una sola falla.');
  const unused = dest.budgetM - r.totalCostM;
  if (sim.outcome !== 'success' && unused > dest.budgetM * 0.2)
    out.push(`Te sobraron $${Math.round(unused)} M: podías invertirlos en más instrumentos, redundancia o un cohete mejor.`);
  if (r.capacityKg && r.wetMassKg < r.capacityKg * 0.3)
    out.push(`Usaste solo el ${Math.round((r.wetMassKg / r.capacityKg) * 100)} % de la capacidad del cohete: quizás uno más pequeño y barato bastaba.`);
  if (r.propulsion?.isp && r.propulsion.isp < 300)
    out.push(`Con Isp ${r.propulsion.isp} s cargaste ${Math.round(r.propellantKg)} kg de combustible. Un motor más eficiente reduce la masa (ecuación de Tsiolkovsky).`);
  if (out.length === 0) out.push('¡Diseño bien balanceado! Prueba un destino más difícil o recorta el presupuesto.');
  return out;
}
