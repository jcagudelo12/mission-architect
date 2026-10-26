import {
  COMPUTER_W,
  LOADS,
  alarms,
  availableActions,
  batteryMinutesLeft,
  burnCostKg,
  consumptionW,
  generationW,
  propellantFrozen,
  type ActionView,
  type EmState,
  type LoadId,
} from '../../engine/emergency/emergency';

export function fmtClock(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `T+ ${h} h ${String(m).padStart(2, '0')} min`;
}

function Bar({ value, max, tone }: { value: number; max: number; tone: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className="cp-bar">
      <div className={`cp-bar-fill ${tone}`} style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }} />
    </div>
  );
}

/** Panel izquierdo: presupuesto de energía en vivo e interruptores */
export function PowerPanel({ s, onToggle }: { s: EmState; onToggle: (id: LoadId) => void }) {
  const gen = generationW(s);
  const use = consumptionW(s);
  const pct = (s.batteryWh / s.batteryMaxWh) * 100;
  const left = batteryMinutesLeft(s);
  return (
    <div className="cp-panel">
      <h3>Panel eléctrico</h3>
      <div className="cp-row">
        <span>Generación solar</span>
        <strong className="ok">{Math.round(gen)} W</strong>
      </div>
      <div className="cp-row">
        <span>Consumo</span>
        <strong className={use > gen ? 'bad' : 'ok'}>{use} W</strong>
      </div>
      <div className="cp-row">
        <span>Batería</span>
        <strong className={pct < 25 ? 'bad' : pct < 50 ? 'warn' : 'ok'}>{pct.toFixed(0)} %</strong>
      </div>
      <Bar value={pct} max={100} tone={pct < 25 ? 'bad' : pct < 50 ? 'warn' : 'ok'} />
      <div className="cp-sub">
        {Number.isFinite(left) ? `Se agota en ${Math.floor(left / 60)} h ${Math.round(left % 60)} min` : 'Cargando'}
      </div>
      <div className="cp-breakers">
        <div className="cp-breaker locked" title="Si se apaga la computadora se pierde la nave">
          <span className="cp-switch on" />
          <span>Computadora de vuelo</span>
          <em>{COMPUTER_W} W</em>
        </div>
        {LOADS.map((l) => (
          <button key={l.id} className="cp-breaker" onClick={() => onToggle(l.id)} title={l.hint} disabled={!!s.outcome}>
            <span className={`cp-switch ${s.loads[l.id] ? 'on' : ''}`} />
            <span>{l.name}</span>
            <em>{l.watts} W</em>
          </button>
        ))}
      </div>
    </div>
  );
}

const SYS_TONE = { ok: 'ok', warn: 'warn', bad: 'bad' } as const;

/** Panel central: reloj, alarmas, recursos y estado de cada sistema */
export function StatusPanel({ s }: { s: EmState }) {
  const al = alarms(s);
  const earth = s.earthReplied
    ? (['Contacto establecido', 'ok'] as const)
    : s.earthCall
      ? ([`Respuesta en ${Math.max(0, s.earthCall.replyAt - s.minute)} min`, 'warn'] as const)
      : (['Sin contacto', 'bad'] as const);
  const systems: [string, string, keyof typeof SYS_TONE][] = [
    ['Computadora', s.computer === 'ok' ? 'En línea' : 'Modo seguro', s.computer === 'ok' ? 'ok' : 'bad'],
    ['Orientación', s.wheels === 'ok' ? (s.loads.wheels ? 'Ruedas OK' : 'Ruedas apagadas') : 'Ruedas en falla', s.wheels === 'ok' && s.loads.wheels ? 'ok' : 'bad'],
    ['Giro', s.spinDegS > 0 ? `${s.spinDegS} °/s` : 'Estable', s.spinDegS > 0 ? 'bad' : 'ok'],
    ['Rastreador estelar', s.starTracker === 'ok' ? 'Calibrado' : 'Sin calibrar', s.starTracker === 'ok' ? 'ok' : 'warn'],
    ['Paneles solares', `${s.wings}/2 alas${s.panelsPointed ? ' · al Sol' : ''}`, s.wings === 2 && s.panelsPointed ? 'ok' : 'warn'],
    ['Antena', s.antennaPointed ? 'Apuntando a la Tierra' : 'Sin apuntar', s.antennaPointed ? 'ok' : 'warn'],
    ['Tierra', earth[0], earth[1]],
    ['Rumbo a Marte', s.courseCorrected ? 'Corregido' : 'Desviado', s.courseCorrected ? 'ok' : 'bad'],
  ];
  return (
    <div className="cp-panel">
      <div className="cp-clock">{fmtClock(s.minute)}</div>
      <div className="cp-alarms">
        {al.length === 0 ? <span className="cp-alarm calm">Sin alarmas</span> : al.map((a) => <span key={a} className="cp-alarm">{a}</span>)}
      </div>
      <div className="cp-grid">
        <div>
          <span>Oxígeno</span>
          <strong className={s.o2Hours < 3 ? 'bad' : s.o2Hours < 6 ? 'warn' : 'ok'}>{s.o2Hours.toFixed(1)} h</strong>
        </div>
        <div>
          <span>Temperatura</span>
          <strong className={s.tempC < 3 ? 'bad' : s.tempC < 8 ? 'warn' : 'ok'}>{s.tempC.toFixed(1)} °C</strong>
        </div>
        <div>
          <span>Combustible</span>
          <strong className={propellantFrozen(s) ? 'bad' : 'ok'}>
            {s.propellantKg.toFixed(1)} kg{propellantFrozen(s) ? ' ❄' : ''}
          </strong>
        </div>
        <div>
          <span>Corregir rumbo cuesta</span>
          <strong className={s.courseCorrected ? 'ok' : burnCostKg(s) > s.propellantKg * 0.7 ? 'bad' : 'warn'}>
            {s.courseCorrected ? 'Hecho' : `${burnCostKg(s).toFixed(1)} kg`}
          </strong>
        </div>
      </div>
      <ul className="cp-systems">
        {systems.map(([name, value, tone]) => (
          <li key={name}>
            <span>{name}</span>
            <strong className={tone}>{value}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Panel derecho: acciones disponibles con su costo en tiempo y lo que les falta */
export function ActionsPanel({ s, onAction }: { s: EmState; onAction: (a: ActionView) => void }) {
  return (
    <div className="cp-panel">
      <h3>Procedimientos</h3>
      <div className="cp-actions">
        {availableActions(s).map((a) => (
          <button key={a.id} className="cp-action" disabled={!!a.blocked || !!s.outcome} onClick={() => onAction(a)} title={a.detail}>
            <div className="cp-action-head">
              <strong>{a.label}</strong>
              <em>{a.minutes} min</em>
            </div>
            <div className="cp-action-detail">{a.blocked || a.detail}</div>
            {a.risky && !a.blocked && <div className="cp-action-risk">⚠ {a.risky}</div>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Panel superior: bitácora y mensajes de la Tierra */
export function LogPanel({ s }: { s: EmState }) {
  return (
    <div className="cp-panel">
      <h3>Bitácora y comunicaciones</h3>
      <ul className="cp-log">
        {[...s.log]
          .reverse()
          .slice(0, 9)
          .map((l, i) => (
            <li key={`${l.minute}-${i}`} className={l.kind}>
              <span>{fmtClock(l.minute).replace('T+ ', '')}</span> {l.text}
            </li>
          ))}
      </ul>
    </div>
  );
}
