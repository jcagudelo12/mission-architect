interface Props {
  label: string;
  value: number;
  max: number;
  unit?: string;
  /** 'under': bien si value ≤ max (masa, costo). 'over': bien si value ≥ max (ciencia). */
  mode?: 'under' | 'over';
  format?: (n: number) => string;
  hint?: string;
}

const defaultFormat = (n: number) => Math.round(n).toLocaleString('es');

export default function Meter({ label, value, max, unit = '', mode = 'under', format = defaultFormat, hint }: Props) {
  const ratio = max > 0 ? value / max : 0;
  const status =
    mode === 'under' ? (ratio > 1 ? 'bad' : ratio > 0.85 ? 'warn' : 'ok') : ratio >= 1 ? 'ok' : ratio >= 0.6 ? 'warn' : 'bad';
  return (
    <div className={`meter ${status}`} title={hint}>
      <div className="meter-head">
        <span>{label}</span>
        <span className="meter-value">
          {format(value)} / {format(max)} {unit}
        </span>
      </div>
      <div className="meter-track">
        <div className="meter-fill" style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
    </div>
  );
}
