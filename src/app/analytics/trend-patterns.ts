import { SgReading } from '../services/sgs-history.service';
import { slotMinForReading } from './agp';

export interface TrendPattern {
  slotMin: number;
  slotEndMin: number;
  timeLabel: string;
  kind: 'high' | 'low';
  daysAffected: number;
  totalDays: number;
  dayPct: number;
  typicalMmol: number;
}

const SLOT_MIN = 30;
const MIN_DAYS_WITH_DATA = 3;
const MIN_DAY_FRACTION = 0.25;

function localDayKey(r: SgReading): string {
  const ts = new Date(r.timestamp).getTime();
  const offsetMin =
    r.utcOffsetMin ?? -new Date(r.timestamp).getTimezoneOffset();
  const localMs = ts + offsetMin * 60 * 1000;
  const d = new Date(localMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatSlot(slotMin: number): string {
  const h = Math.floor(slotMin / 60);
  const m = slotMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatRange(startMin: number, endMin: number): string {
  const endLabel = formatSlot(endMin + SLOT_MIN);
  if (startMin === endMin) return formatSlot(startMin);
  return `${formatSlot(startMin)}–${endLabel}`;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

interface RawPattern {
  slotMin: number;
  kind: 'high' | 'low';
  daysAffected: number;
  totalDays: number;
  dayPct: number;
  typicalMmol: number;
}

function mergeAdjacent(raw: RawPattern[]): TrendPattern[] {
  const sorted = [...raw].sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.slotMin - b.slotMin
  );
  const merged: TrendPattern[] = [];

  for (const p of sorted) {
    const last = merged.length ? merged[merged.length - 1] : null;
    if (
      last &&
      last.kind === p.kind &&
      p.slotMin <= last.slotEndMin + SLOT_MIN
    ) {
      last.slotEndMin = Math.max(last.slotEndMin, p.slotMin);
      last.timeLabel = formatRange(last.slotMin, last.slotEndMin);
      last.daysAffected = Math.max(last.daysAffected, p.daysAffected);
      last.dayPct = Math.max(last.dayPct, p.dayPct);
      last.typicalMmol =
        Math.round(((last.typicalMmol + p.typicalMmol) / 2) * 10) / 10;
    } else {
      merged.push({
        slotMin: p.slotMin,
        slotEndMin: p.slotMin,
        timeLabel: formatRange(p.slotMin, p.slotMin),
        kind: p.kind,
        daysAffected: p.daysAffected,
        totalDays: p.totalDays,
        dayPct: p.dayPct,
        typicalMmol: p.typicalMmol,
      });
    }
  }

  return merged.sort((a, b) => b.dayPct - a.dayPct || b.daysAffected - a.daysAffected);
}

/**
 * Find time-of-day slots that frequently go high or low across days.
 * Adjacent slots merge into ranges (e.g. 09:00–10:30).
 */
export function detectTrendPatterns(
  readings: SgReading[],
  periodStart: Date,
  periodEnd: Date,
  bandLow: number,
  bandHigh: number
): TrendPattern[] {
  const startMs = periodStart.getTime();
  const endMs = periodEnd.getTime();

  const byDaySlot = new Map<string, Map<number, number[]>>();

  for (const r of readings) {
    const t = new Date(r.timestamp).getTime();
    if (t < startMs || t > endMs || r.mmol <= 0) continue;
    const day = localDayKey(r);
    const slot = slotMinForReading(r);
    if (!byDaySlot.has(day)) byDaySlot.set(day, new Map());
    const slots = byDaySlot.get(day)!;
    const list = slots.get(slot) || [];
    list.push(r.mmol);
    slots.set(slot, list);
  }

  const totalDays = byDaySlot.size;
  if (totalDays < MIN_DAYS_WITH_DATA) return [];

  const slotStats = new Map<
    number,
    { highDays: number; lowDays: number; highVals: number[]; lowVals: number[] }
  >();

  for (const slots of byDaySlot.values()) {
    for (const [slot, vals] of slots) {
      if (!vals.length) continue;
      const med = median(vals);
      const stat = slotStats.get(slot) || {
        highDays: 0,
        lowDays: 0,
        highVals: [],
        lowVals: [],
      };
      if (med > bandHigh) {
        stat.highDays++;
        stat.highVals.push(med);
      } else if (med < bandLow) {
        stat.lowDays++;
        stat.lowVals.push(med);
      }
      slotStats.set(slot, stat);
    }
  }

  const raw: RawPattern[] = [];

  for (const [slot, stat] of slotStats) {
    const highPct = stat.highDays / totalDays;
    if (stat.highDays >= 2 && highPct >= MIN_DAY_FRACTION) {
      raw.push({
        slotMin: slot,
        kind: 'high',
        daysAffected: stat.highDays,
        totalDays,
        dayPct: Math.round(highPct * 1000) / 10,
        typicalMmol:
          Math.round(
            (stat.highVals.reduce((a, b) => a + b, 0) / stat.highVals.length) * 10
          ) / 10,
      });
    }
    const lowPct = stat.lowDays / totalDays;
    if (stat.lowDays >= 2 && lowPct >= MIN_DAY_FRACTION) {
      raw.push({
        slotMin: slot,
        kind: 'low',
        daysAffected: stat.lowDays,
        totalDays,
        dayPct: Math.round(lowPct * 1000) / 10,
        typicalMmol:
          Math.round(
            (stat.lowVals.reduce((a, b) => a + b, 0) / stat.lowVals.length) * 10
          ) / 10,
      });
    }
  }

  return mergeAdjacent(raw).slice(0, 4);
}

export function formatTrendPattern(p: TrendPattern): string {
  const band = p.kind === 'high' ? 'high' : 'low';
  return `${p.timeLabel} — ${band} on ${p.daysAffected} of ${p.totalDays} days (typical ${p.typicalMmol.toFixed(1)} mmol/L)`;
}
