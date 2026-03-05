import { memo, useState, useCallback } from 'react';
import { CONFIG } from '../../config';
import styles from './SandboxPanel.module.css';

interface SandboxState {
  eventsDisabled: boolean;
  productivityFood: number;
  productivityGoods: number;
  productivityServices: number;
  consumptionFood: number;
  consumptionGoods: number;
  consumptionServices: number;
  priceElasticity: number;
  inventorySpoilage: number;
  healthDecay: number;
  healthRecovery: number;
  birthProbability: number;
  leaveThreshold: number;
}

const DEFAULTS: SandboxState = {
  eventsDisabled: false,
  productivityFood: CONFIG.BASE_PRODUCTIVITY.food,
  productivityGoods: CONFIG.BASE_PRODUCTIVITY.goods,
  productivityServices: CONFIG.BASE_PRODUCTIVITY.services,
  consumptionFood: CONFIG.CONSUMPTION.food,
  consumptionGoods: CONFIG.CONSUMPTION.goods,
  consumptionServices: CONFIG.CONSUMPTION.services,
  priceElasticity: CONFIG.PRICE_ELASTICITY,
  inventorySpoilage: CONFIG.INVENTORY_SPOILAGE_RATE,
  healthDecay: CONFIG.HEALTH_DECAY_PER_UNMET_NEED,
  healthRecovery: CONFIG.HEALTH_RECOVERY_ALL_MET,
  birthProbability: CONFIG.BIRTH_BASE_PROBABILITY,
  leaveThreshold: CONFIG.LEAVE_SATISFACTION_THRESHOLD,
};

// Mutable reference to CONFIG for sandbox overrides
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cfg = CONFIG as any;

function applyToConfig(state: SandboxState): void {
  cfg.BASE_PRODUCTIVITY.food = state.productivityFood;
  cfg.BASE_PRODUCTIVITY.goods = state.productivityGoods;
  cfg.BASE_PRODUCTIVITY.services = state.productivityServices;
  cfg.CONSUMPTION.food = state.consumptionFood;
  cfg.CONSUMPTION.goods = state.consumptionGoods;
  cfg.CONSUMPTION.services = state.consumptionServices;
  cfg.PRICE_ELASTICITY = state.priceElasticity;
  cfg.INVENTORY_SPOILAGE_RATE = state.inventorySpoilage;
  cfg.HEALTH_DECAY_PER_UNMET_NEED = state.healthDecay;
  cfg.HEALTH_RECOVERY_ALL_MET = state.healthRecovery;
  cfg.BIRTH_BASE_PROBABILITY = state.birthProbability;
  cfg.LEAVE_SATISFACTION_THRESHOLD = state.leaveThreshold;
  cfg.RANDOM_EVENT_PROBABILITY_MULTIPLIER = state.eventsDisabled ? 0 : 0.5;
}

function resetConfig(): void {
  applyToConfig(DEFAULTS);
}

interface SliderRowProps {
  label: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}

function SliderRow({ label, value, defaultValue, min, max, step, onChange, format }: SliderRowProps) {
  const display = format ? format(value) : value.toFixed(2);
  const changed = Math.abs(value - defaultValue) > step * 0.5;

  return (
    <div className={styles.sliderRow}>
      <div className={styles.sliderLabel}>
        <span>{label}</span>
        <span className={changed ? styles.valueChanged : styles.value}>{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className={styles.slider}
      />
    </div>
  );
}

interface Props {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export const SandboxPanel = memo(function SandboxPanel({ enabled, onToggle }: Props) {
  const [state, setState] = useState<SandboxState>({ ...DEFAULTS });
  const [collapsed, setCollapsed] = useState(true);

  const update = useCallback(<K extends keyof SandboxState>(key: K, value: SandboxState[K]) => {
    setState(prev => {
      const next = { ...prev, [key]: value };
      if (enabled) applyToConfig(next);
      return next;
    });
  }, [enabled]);

  const handleToggle = useCallback(() => {
    if (enabled) {
      resetConfig();
      onToggle(false);
    } else {
      applyToConfig(state);
      onToggle(true);
    }
  }, [enabled, state, onToggle]);

  const handleReset = useCallback(() => {
    setState({ ...DEFAULTS });
    if (enabled) applyToConfig(DEFAULTS);
  }, [enabled]);

  return (
    <div className={`${styles.panel} ${enabled ? styles.panelActive : ''}`}>
      <button className={styles.header} onClick={() => setCollapsed(!collapsed)}>
        <span className={styles.headerTitle}>
          {enabled ? '🧪 ' : ''}沙盒模式 Sandbox
        </span>
        <span className={`${styles.chevron} ${collapsed ? '' : styles.chevronOpen}`}>▾</span>
      </button>

      {!collapsed && (
        <div className={styles.body}>
          <div className={styles.toggleRow}>
            <button
              className={`${styles.toggleBtn} ${enabled ? styles.toggleBtnActive : ''}`}
              onClick={handleToggle}
            >
              {enabled ? '停用沙盒 Disable' : '啟用沙盒 Enable'}
            </button>
            {enabled && (
              <button className={styles.resetBtn} onClick={handleReset}>
                重置參數 Reset
              </button>
            )}
          </div>

          {enabled && (
            <div className={styles.hint}>
              參數即時生效。下回合起產出/消費/價格會反映變動。
            </div>
          )}

          <div className={styles.group}>
            <div className={styles.groupTitle}>隨機事件</div>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={state.eventsDisabled}
                onChange={e => update('eventsDisabled', e.target.checked)}
                disabled={!enabled}
              />
              <span>凍結隨機事件 Freeze Events</span>
            </label>
          </div>

          <div className={styles.group}>
            <div className={styles.groupTitle}>生產力 Productivity</div>
            <SliderRow label="食物" value={state.productivityFood} defaultValue={DEFAULTS.productivityFood} min={0.5} max={8} step={0.1} onChange={v => update('productivityFood', v)} />
            <SliderRow label="商品" value={state.productivityGoods} defaultValue={DEFAULTS.productivityGoods} min={0.3} max={5} step={0.1} onChange={v => update('productivityGoods', v)} />
            <SliderRow label="服務" value={state.productivityServices} defaultValue={DEFAULTS.productivityServices} min={0.2} max={4} step={0.1} onChange={v => update('productivityServices', v)} />
          </div>

          <div className={styles.group}>
            <div className={styles.groupTitle}>消費 Consumption</div>
            <SliderRow label="食物" value={state.consumptionFood} defaultValue={DEFAULTS.consumptionFood} min={0.2} max={3} step={0.1} onChange={v => update('consumptionFood', v)} />
            <SliderRow label="商品" value={state.consumptionGoods} defaultValue={DEFAULTS.consumptionGoods} min={0.1} max={2} step={0.05} onChange={v => update('consumptionGoods', v)} />
            <SliderRow label="服務" value={state.consumptionServices} defaultValue={DEFAULTS.consumptionServices} min={0.05} max={1.5} step={0.05} onChange={v => update('consumptionServices', v)} />
          </div>

          <div className={styles.group}>
            <div className={styles.groupTitle}>市場 Market</div>
            <SliderRow label="價格彈性" value={state.priceElasticity} defaultValue={DEFAULTS.priceElasticity} min={0.01} max={0.2} step={0.005} onChange={v => update('priceElasticity', v)} />
            <SliderRow label="庫存腐損率" value={state.inventorySpoilage} defaultValue={DEFAULTS.inventorySpoilage} min={0} max={1} step={0.05} onChange={v => update('inventorySpoilage', v)} format={v => `${(v * 100).toFixed(0)}%`} />
          </div>

          <div className={styles.group}>
            <div className={styles.groupTitle}>生存 Health/Demographics</div>
            <SliderRow label="健康衰減/需求" value={state.healthDecay} defaultValue={DEFAULTS.healthDecay} min={0} max={10} step={0.5} onChange={v => update('healthDecay', v)} />
            <SliderRow label="健康恢復" value={state.healthRecovery} defaultValue={DEFAULTS.healthRecovery} min={0} max={20} step={1} onChange={v => update('healthRecovery', v)} />
            <SliderRow label="出生機率" value={state.birthProbability} defaultValue={DEFAULTS.birthProbability} min={0} max={0.3} step={0.01} onChange={v => update('birthProbability', v)} format={v => `${(v * 100).toFixed(0)}%`} />
            <SliderRow label="離島滿意度門檻" value={state.leaveThreshold} defaultValue={DEFAULTS.leaveThreshold} min={0} max={50} step={1} onChange={v => update('leaveThreshold', v)} />
          </div>
        </div>
      )}
    </div>
  );
});
