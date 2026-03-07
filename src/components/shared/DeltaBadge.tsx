import styles from './DeltaBadge.module.css';

interface DeltaBadgeProps {
  value: number;
  prefix?: string;
  suffix?: string;
  /** If true, positive = bad (red), negative = good (green). Used for Gini. */
  invert?: boolean;
}

export function DeltaBadge({ value, prefix = '', suffix = '', invert = false }: DeltaBadgeProps) {
  if (Math.abs(value) < 0.01) return null;

  const isPositive = value > 0;
  let cls: string;
  if (invert) {
    cls = isPositive ? styles.deltaGiniUp : styles.deltaGiniDown;
  } else {
    cls = isPositive ? styles.deltaUp : styles.deltaDown;
  }

  const formatted = `${isPositive ? '+' : ''}${prefix}${Math.abs(value) < 10 ? value.toFixed(1) : Math.round(value)}${suffix}`;
  return <span className={`${styles.delta} ${cls}`}>{formatted}</span>;
}
