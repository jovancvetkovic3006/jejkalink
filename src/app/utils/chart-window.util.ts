import { SgReading } from '../services/sgs-history.service';
import { readingMmol } from './chart-data.util';

export interface ChartWindow {
  startMs: number;
  endMs: number;
}

/** If the window is mostly empty, anchor the visible span to the latest readings. */
export function effectiveChartWindow(
  readings: SgReading[],
  startMs: number,
  endMs: number,
  minSpanMs: number,
  fillRatio = 0.35
): ChartWindow {
  const inWindow = readings.filter((r) => {
    const t = new Date(r.timestamp).getTime();
    return t >= startMs && t <= endMs && readingMmol(r) > 0;
  });
  if (!inWindow.length) {
    return { startMs, endMs };
  }

  const firstT = new Date(inWindow[0].timestamp).getTime();
  const lastT = new Date(inWindow[inWindow.length - 1].timestamp).getTime();
  const dataSpan = Math.max(minSpanMs / 4, lastT - firstT);
  const windowSpan = endMs - startMs;

  if (dataSpan >= windowSpan * fillRatio) {
    return { startMs, endMs };
  }

  const pad = Math.max(minSpanMs / 6, (windowSpan - dataSpan) * 0.08);
  const anchoredEnd = Math.min(endMs, lastT + pad);
  const anchoredStart = Math.max(startMs, anchoredEnd - windowSpan);
  return { startMs: anchoredStart, endMs: anchoredEnd };
}

export function formatReadingScrubLabel(r: SgReading): string {
  const when = new Date(r.timestamp).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${when} · ${readingMmol(r).toFixed(1)} mmol/L`;
}
