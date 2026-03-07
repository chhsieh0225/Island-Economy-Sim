import { t as i18nT, tSector as i18nSector } from '../i18n/i18n';

/**
 * Engine-friendly translation with parameter interpolation.
 *
 * Usage:
 *   te('event.tax_collected', { rate: 15, amount: 42 })
 *   // key in JSON: "event.tax_collected": "📋 Tax rate {rate}% applied → revenue ${amount}"
 */
export function te(key: string, params?: Record<string, string | number>): string {
  let msg = i18nT(key);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      msg = msg.replaceAll(`{${k}}`, String(v));
    }
  }
  return msg;
}

/** Shorthand for sector label in current locale. */
export function teSector(sector: string): string {
  return i18nSector(sector);
}
