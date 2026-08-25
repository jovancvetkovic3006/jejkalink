import { formatMmol, toMmol } from '../domain/glucose';
import { carelinkWallClock } from './carelink-time.util';

export type CareLinkMarkerEvent = {
  id: string;
  kind: 'bolus' | 'alarm' | 'sensor' | 'meal' | 'basal' | 'other';
  timestamp: string;
  label: string;
  detail?: string;
  units?: number;
};

/**
 * Map CareLink BLENGP markers (and legacy flat shapes) to app events.
 * Exported for fixture tests.
 */
export function eventsFromCareLinkMarkers(
  markers: any[]
): CareLinkMarkerEvent[] {
  if (!markers?.length) return [];
  const out: CareLinkMarkerEvent[] = [];

  for (const m of markers) {
    if (!m) continue;
    const type = String(m.type || m.kind || '').toUpperCase();
    const ts = m.timestamp || m.time || m.displayTime;
    if (!ts) continue;
    const tsId = carelinkWallClock(String(ts));
    const dv = m.data?.dataValues || m.dataValues || {};

    if (type === 'INSULIN') {
      const amount = Number(
        dv.deliveredFastAmount ??
          dv.programmedFastAmount ??
          m.amount ??
          m.bolusAmount ??
          m.value
      );
      if (!(amount > 0)) continue;
      const carbs = m.carbs ?? m.carbohydrates ?? dv.carbAmount;
      const detailParts: string[] = [];
      if (carbs && Number(carbs) > 0) detailParts.push(`${carbs} g carbs`);
      if (dv.bolusType) detailParts.push(String(dv.bolusType).toLowerCase());
      out.push({
        id: `insulin-${tsId}`,
        kind: 'bolus',
        timestamp: ts,
        label: `Bolus ${amount.toFixed(1)} u`,
        detail: detailParts.length ? detailParts.join(' · ') : undefined,
        units: amount,
      });
      continue;
    }

    if (type === 'LOW_GLUCOSE_SUSPENDED') {
      out.push({
        id: `lgs-${tsId}`,
        kind: 'alarm',
        timestamp: ts,
        label: 'Suspended before low',
        detail: 'Low glucose suspend',
      });
      continue;
    }

    if (type === 'CALIBRATION') {
      const ok =
        dv.calibrationSuccess === true ||
        dv.calibrationType === 'CALIBRATION_COMPLETE';
      const unitValue = Number(dv.unitValue);
      // CareLink labels bgUnits MMOL_L but unitValue is mg/dL in observed dumps.
      const mmol =
        Number.isFinite(unitValue) && unitValue > 0
          ? formatMmol(toMmol(unitValue))
          : null;
      out.push({
        id: `cal-${tsId}`,
        kind: 'sensor',
        timestamp: ts,
        label: ok ? 'Calibration accepted' : 'Calibration',
        detail: mmol ? `${mmol} mmol/L` : undefined,
      });
      continue;
    }

    if (type === 'AUTO_MODE_STATUS') {
      continue;
    }

    const amount = Number(m.amount ?? m.bolusAmount ?? m.value);
    const carbs = m.carbs ?? m.carbohydrates;
    const meal = m.meal ?? m.mealType ?? m.foodType;
    if (amount > 0) {
      const detailParts: string[] = [];
      if (carbs) detailParts.push(`${carbs} g carbs`);
      if (meal) detailParts.push(String(meal).toLowerCase());
      out.push({
        id: `bolus-${tsId}-${amount}`,
        kind: 'bolus',
        timestamp: ts,
        label: `Bolus ${amount.toFixed(1)} u`,
        detail: detailParts.length ? detailParts.join(' · ') : undefined,
        units: amount,
      });
    } else if (carbs && Number(carbs) > 0) {
      const detailParts: string[] = [`${carbs} g carbs`];
      if (meal) detailParts.push(String(meal).toLowerCase());
      out.push({
        id: `meal-${tsId}`,
        kind: 'meal',
        timestamp: ts,
        label: 'Carbs logged',
        detail: detailParts.join(' · '),
      });
    }
  }

  return out;
}
