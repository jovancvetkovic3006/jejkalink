export interface SgPoint {
  sg?: number;
  mmol?: number;
  timestamp: string;
}

/** Keep at most maxPoints by uniform stride (always keeps first and last). */
export function downsampleSgPoints<T extends SgPoint>(points: T[], maxPoints: number): T[] {
  if (points.length <= maxPoints) return points;
  const stride = Math.ceil(points.length / maxPoints);
  const out: T[] = [];
  for (let i = 0; i < points.length; i += stride) {
    out.push(points[i]);
  }
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) {
    out.push(last);
  }
  return out;
}

export function readingMmol(p: SgPoint): number {
  if (p.mmol != null && p.mmol > 0) return p.mmol;
  if (p.sg != null && p.sg > 0) return p.sg / 18.0182;
  return 0;
}
