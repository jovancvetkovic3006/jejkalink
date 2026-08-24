import { periodMetrics } from './metrics';
import { detectGaps } from './coverage';
import { detectHypoEpisodes, postMealRises } from './episodes';
import { SgReading } from '../services/sgs-history.service';

function reading(mmol: number, iso: string): SgReading {
  return { mmol, timestamp: iso, sg: Math.round(mmol * 18.0182) };
}

describe('analytics', () => {
  const dayStart = new Date('2026-05-01T00:00:00');
  const dayEnd = new Date('2026-05-01T23:59:59');

  it('computes TIR on a clean day', () => {
    const readings: SgReading[] = [];
    for (let h = 0; h < 24; h++) {
      readings.push(reading(6.0, `2026-05-01T${String(h).padStart(2, '0')}:00:00`));
      readings.push(reading(6.2, `2026-05-01T${String(h).padStart(2, '0')}:05:00`));
    }
    const m = periodMetrics(readings, dayStart, dayEnd);
    expect(m.count).toBeGreaterThan(0);
    expect(m.tirPct).toBe(100);
    expect(m.meanLabel).toBe('6.1');
  });

  it('detects gaps on a gappy day', () => {
    const readings: SgReading[] = [
      reading(5.5, '2026-05-01T08:00:00'),
      reading(5.6, '2026-05-01T08:05:00'),
      reading(5.7, '2026-05-01T12:00:00'),
    ];
    const cov = detectGaps(readings, dayStart, dayEnd, 10);
    expect(cov.gapCount).toBeGreaterThan(0);
    expect(cov.coveragePct).toBeLessThan(100);
  });

  it('flags all-low day', () => {
    const readings: SgReading[] = [
      reading(3.2, '2026-05-01T10:00:00'),
      reading(3.1, '2026-05-01T10:05:00'),
      reading(2.9, '2026-05-01T10:10:00'),
    ];
    const m = periodMetrics(readings, dayStart, dayEnd);
    expect(m.belowPct).toBe(100);
    expect(m.veryLowPct).toBeGreaterThan(0);
  });

  it('detects hypo episodes', () => {
    const readings: SgReading[] = [
      reading(5.0, '2026-05-01T08:00:00'),
      reading(3.5, '2026-05-01T08:05:00'),
      reading(3.2, '2026-05-01T08:10:00'),
      reading(4.5, '2026-05-01T08:15:00'),
    ];
    const eps = detectHypoEpisodes(readings, dayStart, dayEnd);
    expect(eps.length).toBe(1);
    expect(eps[0].nadirMmol).toBeLessThanOrEqual(3.2);
  });

  it('computes post-meal rise', () => {
    const readings: SgReading[] = [
      reading(5.0, '2026-05-01T12:00:00'),
      reading(6.5, '2026-05-01T12:30:00'),
      reading(9.0, '2026-05-01T13:00:00'),
      reading(8.0, '2026-05-01T13:30:00'),
    ];
    const rises = postMealRises(
      readings,
      [{ timestamp: '2026-05-01T12:00:00' }],
      10.0
    );
    expect(rises.length).toBe(1);
    expect(rises[0].riseMmol).toBeGreaterThan(3);
  });
});
