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

function markerTimestamp(m: any): string | null {
  // v11 hour-shift is applied to timestamp; displayTime can sit 1h ahead of the pump.
  const ts =
    m?.timestamp || m?.dateTime || m?.datetime || m?.displayTime || m?.time;
  if (ts == null || ts === '') return null;
  return String(ts);
}

function dataValues(m: any): any {
  return m?.data?.dataValues || m?.dataValues || {};
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Fast + extended when both exist (xDrip parity). */
export function insulinAmountFromMarker(m: any): number {
  const dv = dataValues(m);
  const fast = num(
    dv.deliveredFastAmount ?? m.deliveredFastAmount ?? dv.programmedFastAmount
  );
  const ext = num(
    dv.deliveredExtendedAmount ?? m.deliveredExtendedAmount
  );
  if (fast > 0 || ext > 0) return fast + ext;
  const units = num(dv.insulinUnits);
  if (units > 0) return units;
  return num(m?.amount ?? m?.bolusAmount ?? m?.value);
}

function carbAmountFromMarker(m: any): number {
  const dv = dataValues(m);
  return num(m?.amount ?? dv.amount ?? m?.carbs ?? m?.carbohydrates ?? dv.carbAmount);
}

function bgMmolFromMarker(m: any): number | null {
  const dv = dataValues(m);
  const raw = num(m?.value ?? dv.unitValue ?? dv.bg);
  if (!(raw > 0)) return null;
  // CareLink often labels MMOL_L while unitValue is mg/dL.
  return raw > 40 ? toMmol(raw) : raw;
}

/**
 * Map CareLink BLENGP markers (and legacy flat shapes) to app events.
 * Exported for fixture tests.
 */
export function eventsFromCareLinkMarkers(
  markers: any[]
): CareLinkMarkerEvent[] {
  if (!markers?.length) return [];
  const out: CareLinkMarkerEvent[] = [];
  const mealsByIndex = new Map<number, any>();
  const insulinIndexes = new Set<number>();

  for (const m of markers) {
    if (!m) continue;
    const type = String(m.type || m.kind || '').toUpperCase();
    if (type === 'INSULIN' && m.index != null) insulinIndexes.add(Number(m.index));
    if (type === 'MEAL' && m.index != null) mealsByIndex.set(Number(m.index), m);
  }

  for (const m of markers) {
    if (!m) continue;
    const type = String(m.type || m.kind || '').toUpperCase();
    const ts = markerTimestamp(m);
    if (!ts) continue;
    const tsId = carelinkWallClock(ts);
    const dv = dataValues(m);

    if (type === 'AUTO_MODE_STATUS' || type === 'AUTO_BASAL_DELIVERY') {
      continue;
    }

    if (type === 'INSULIN') {
      const amount = insulinAmountFromMarker(m);
      if (!(amount > 0)) continue;
      const meal = m.index != null ? mealsByIndex.get(Number(m.index)) : undefined;
      const carbs = carbAmountFromMarker(meal) || carbAmountFromMarker(m);
      const detailParts: string[] = [];
      if (carbs > 0) detailParts.push(`${carbs} g carbs`);
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

    if (type === 'MEAL') {
      if (m.index != null && insulinIndexes.has(Number(m.index))) continue;
      const carbs = carbAmountFromMarker(m);
      if (!(carbs > 0)) continue;
      out.push({
        id: `meal-${tsId}`,
        kind: 'meal',
        timestamp: ts,
        label: 'Carbs logged',
        detail: `${carbs} g carbs`,
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

    if (type === 'CALIBRATION' || type === 'BG_READING' || type === 'BG') {
      const mmol = bgMmolFromMarker(m);
      const mmolLabel = mmol != null ? `${formatMmol(mmol)} mmol/L` : undefined;
      if (type === 'CALIBRATION') {
        const ok =
          dv.calibrationSuccess === true ||
          dv.calibrationType === 'CALIBRATION_COMPLETE' ||
          m.calibrationSuccess === true;
        out.push({
          id: `cal-${tsId}`,
          kind: 'sensor',
          timestamp: ts,
          label: ok ? 'Calibration accepted' : 'Calibration',
          detail: mmolLabel,
        });
      } else {
        out.push({
          id: `bg-${tsId}`,
          kind: 'sensor',
          timestamp: ts,
          label: mmolLabel ? `Finger BG ${mmolLabel}` : 'Finger BG',
          detail: 'Meter reading',
        });
      }
      continue;
    }

    const amount = num(m.amount ?? m.bolusAmount ?? m.value);
    const carbs = num(m.carbs ?? m.carbohydrates);
    const meal = m.meal ?? m.mealType ?? m.foodType;
    if (amount > 0) {
      const detailParts: string[] = [];
      if (carbs > 0) detailParts.push(`${carbs} g carbs`);
      if (meal) detailParts.push(String(meal).toLowerCase());
      out.push({
        id: `bolus-${tsId}-${amount}`,
        kind: 'bolus',
        timestamp: ts,
        label: `Bolus ${amount.toFixed(1)} u`,
        detail: detailParts.length ? detailParts.join(' · ') : undefined,
        units: amount,
      });
    } else if (carbs > 0) {
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

  return collapseDuplicateBoluses(out);
}

/** CareLink often emits the same delivery twice, a second or two apart. */
export const BOLUS_PAIR_MS = 90_000;

export function collapseDuplicateBoluses<
  T extends {
    kind: string;
    timestamp: string;
    label: string;
    detail?: string;
    units?: number;
  },
>(events: T[]): T[] {
  const sorted = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const out: T[] = [];
  for (const event of sorted) {
    if (event.kind !== 'bolus') {
      out.push(event);
      continue;
    }
    const copy = { ...event };
    const at = new Date(copy.timestamp).getTime();
    const units = copy.units ?? unitsFromBolusLabel(copy.label);
    const prior = out.find((prev) => {
      if (prev.kind !== 'bolus') return false;
      const dt = Math.abs(new Date(prev.timestamp).getTime() - at);
      if (dt > BOLUS_PAIR_MS) return false;
      const prevUnits = prev.units ?? unitsFromBolusLabel(prev.label);
      if (units > 0 && prevUnits > 0) return Math.abs(prevUnits - units) < 0.05;
      return prev.label === copy.label;
    });
    if (prior) {
      if ((copy.detail?.length || 0) > (prior.detail?.length || 0)) {
        prior.detail = copy.detail;
      }
      continue;
    }
    out.push(copy);
  }
  return out.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

function unitsFromBolusLabel(label: string): number {
  const match = /([\d.]+)\s*u/i.exec(label);
  const n = match ? Number(match[1]) : 0;
  return Number.isFinite(n) ? n : 0;
}
