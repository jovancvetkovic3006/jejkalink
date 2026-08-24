import { SgReading } from '../services/sgs-history.service';
import { LOW, LOW_CLEAR, VERY_LOW } from '../domain/glucose';

export interface HypoEpisode {
  start: string;
  end: string;
  durationMin: number;
  nadirMmol: number;
  /** Rose to clear threshold before period ended. */
  recovered: boolean;
}

export interface PostMealRise {
  bolusTimestamp: string;
  baselineMmol: number;
  peakMmol: number;
  riseMmol: number;
  peakMin: number;
  backInRangeMin: number | null;
}

export interface BolusAnchor {
  timestamp: string;
  units?: number;
}

const GAP_MS = 10 * 60 * 1000;
const MIN_HYPO_MIN = 5;

/** Episodes below threshold; gaps > 10 min break an episode. */
export function detectHypoEpisodes(
  readings: SgReading[],
  periodStart: Date,
  periodEnd: Date,
  threshold = LOW
): HypoEpisode[] {
  const startMs = periodStart.getTime();
  const endMs = periodEnd.getTime();
  const sorted = readings
    .filter((r) => {
      const t = new Date(r.timestamp).getTime();
      return t >= startMs && t <= endMs && r.mmol > 0;
    })
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const episodes: HypoEpisode[] = [];
  let cur: { start: string; end: string; nadir: number } | null = null;
  let lastTs = 0;

  for (const r of sorted) {
    const ts = new Date(r.timestamp).getTime();
    if (cur && ts - lastTs > GAP_MS) {
      pushHypo(cur, episodes);
      cur = null;
    }
    if (r.mmol < threshold) {
      if (!cur) cur = { start: r.timestamp, end: r.timestamp, nadir: r.mmol };
      else {
        cur.end = r.timestamp;
        cur.nadir = Math.min(cur.nadir, r.mmol);
      }
    } else if (cur) {
      pushHypo(cur, episodes);
      cur = null;
    }
    lastTs = ts;
  }
  if (cur) pushHypo(cur, episodes, false);

  return episodes.filter((e) => e.durationMin >= MIN_HYPO_MIN);
}

function pushHypo(
  cur: { start: string; end: string; nadir: number },
  out: HypoEpisode[],
  recovered = true
) {
  const dur = Math.round(
    (new Date(cur.end).getTime() - new Date(cur.start).getTime()) / 60000
  );
  out.push({
    start: cur.start,
    end: cur.end,
    durationMin: Math.max(dur, MIN_HYPO_MIN),
    nadirMmol: Math.round(cur.nadir * 10) / 10,
    recovered,
  });
}

/** Very-low episodes (< 3.0) for clinic summaries. */
export function detectVeryLowEpisodes(
  readings: SgReading[],
  periodStart: Date,
  periodEnd: Date
): HypoEpisode[] {
  return detectHypoEpisodes(readings, periodStart, periodEnd, VERY_LOW);
}

export function formatHypoEpisode(e: HypoEpisode): string {
  const t0 = new Date(e.start).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${t0} · ${e.durationMin} min · nadir ${e.nadirMmol.toFixed(1)} mmol/L`;
}

/**
 * Post-bolus glucose rise within windowMin (default 3 h).
 * Pure analytics — bolus timestamps come from the events store.
 */
export function postMealRises(
  readings: SgReading[],
  boluses: BolusAnchor[],
  bandHigh: number,
  windowMin = 180
): PostMealRise[] {
  const sorted = [...readings]
    .filter((r) => r.mmol > 0)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const out: PostMealRise[] = [];
  for (const b of boluses) {
    const t0 = new Date(b.timestamp).getTime();
    const windowEnd = t0 + windowMin * 60 * 1000;
    const inWindow = sorted.filter((r) => {
      const t = new Date(r.timestamp).getTime();
      return t >= t0 && t <= windowEnd;
    });
    if (inWindow.length < 2) continue;

    const before = sorted.filter((r) => {
      const t = new Date(r.timestamp).getTime();
      return t >= t0 - 15 * 60 * 1000 && t <= t0;
    });
    const baseline = before.length ? before[before.length - 1].mmol : inWindow[0].mmol;

    let peak = inWindow[0];
    for (const r of inWindow) {
      if (r.mmol > peak.mmol) peak = r;
    }
    const peakMin = Math.round(
      (new Date(peak.timestamp).getTime() - t0) / 60000
    );
    const rise = Math.round((peak.mmol - baseline) * 10) / 10;

    let backInRangeMin: number | null = null;
    const peakTs = new Date(peak.timestamp).getTime();
    for (const r of inWindow) {
      const t = new Date(r.timestamp).getTime();
      if (t > peakTs && r.mmol <= bandHigh) {
        backInRangeMin = Math.round((t - t0) / 60000);
        break;
      }
    }

    out.push({
      bolusTimestamp: b.timestamp,
      baselineMmol: Math.round(baseline * 10) / 10,
      peakMmol: Math.round(peak.mmol * 10) / 10,
      riseMmol: rise,
      peakMin,
      backInRangeMin,
    });
  }
  return out;
}

export function summarizePostMealRises(rises: PostMealRise[]): {
  count: number;
  medianPeakMin: number;
  medianRiseMmol: number;
  medianBackMin: number | null;
} {
  if (!rises.length) {
    return { count: 0, medianPeakMin: 0, medianRiseMmol: 0, medianBackMin: null };
  }
  const med = (vals: number[]) => {
    const s = [...vals].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };
  const back = rises.map((r) => r.backInRangeMin).filter((v): v is number => v != null);
  return {
    count: rises.length,
    medianPeakMin: Math.round(med(rises.map((r) => r.peakMin))),
    medianRiseMmol: Math.round(med(rises.map((r) => r.riseMmol)) * 10) / 10,
    medianBackMin: back.length ? Math.round(med(back)) : null,
  };
}

/** Minutes below clear threshold after episode ends (recovery speed). */
export function hypoRecoveryMinutes(
  readings: SgReading[],
  episode: HypoEpisode
): number | null {
  const endMs = new Date(episode.end).getTime();
  const after = readings
    .filter((r) => {
      const t = new Date(r.timestamp).getTime();
      return t > endMs && r.mmol > 0;
    })
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  for (const r of after) {
    if (r.mmol >= LOW_CLEAR) {
      return Math.round(
        (new Date(r.timestamp).getTime() - endMs) / 60000
      );
    }
  }
  return null;
}
