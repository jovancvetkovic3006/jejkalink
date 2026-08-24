import { toMmol } from '../domain/glucose';

export interface CsvSgRow {
  sg: number;
  timestamp: string;
}

/** Parse a CareLink-style glucose CSV export (mg/dL) into normalized rows. */
export function parseCareLinkCsv(text: string): CsvSgRow[] {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const delim = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  const headers = splitCsvLine(lines[0], delim).map(normalizeHeader);

  const dateIdx = headers.findIndex((h) => /date/i.test(h));
  const timeIdx = headers.findIndex((h) => /time/i.test(h));
  const glucoseIdx = headers.findIndex(
    (h) =>
      /glucose|sg|sensor/i.test(h) &&
      (/mg/i.test(h) || h.includes('mgdl') || h.includes('mg_dl'))
  );
  const mmolIdx =
    glucoseIdx >= 0
      ? -1
      : headers.findIndex((h) => /glucose|sg|sensor/i.test(h) && /mmol/i.test(h));

  if (dateIdx < 0 || glucoseIdx < 0 && mmolIdx < 0) return [];

  const out: CsvSgRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i], delim);
    const dateRaw = cols[dateIdx]?.trim();
    if (!dateRaw) continue;

    const timeRaw = timeIdx >= 0 ? cols[timeIdx]?.trim() : '00:00';
    const ts = parseDateTime(dateRaw, timeRaw);
    if (!ts) continue;

    let sgMg = 0;
    if (glucoseIdx >= 0) {
      sgMg = parseNumber(cols[glucoseIdx]);
    } else if (mmolIdx >= 0) {
      const mmol = parseNumber(cols[mmolIdx]);
      if (mmol > 0) {
        out.push({ sg: Math.round(mmol * 18.0182), timestamp: ts });
        continue;
      }
    }
    if (sgMg > 0) out.push({ sg: sgMg, timestamp: ts });
  }

  return out;
}

function normalizeHeader(h: string): string {
  return h.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && ch === delim) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseNumber(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number(String(raw).replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function parseDateTime(dateRaw: string, timeRaw: string): string | null {
  const combined = `${dateRaw} ${timeRaw}`.trim();
  const isoLike = combined.replace(
    /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\s+(\d{1,2}):(\d{2})/,
    (_, d, m, y, hh, mm) => {
      const year = y.length === 2 ? `20${y}` : y;
      return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${hh.padStart(2, '0')}:${mm}:00`;
    }
  );
  const d = new Date(isoLike.includes('T') ? isoLike : combined);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Row count + mmol preview for UI feedback. */
export function csvImportSummary(rows: CsvSgRow[]): string {
  if (!rows.length) return 'No glucose rows found';
  const first = toMmol(rows[0].sg).toFixed(1);
  const last = toMmol(rows[rows.length - 1].sg).toFixed(1);
  return `${rows.length} readings · ${first}–${last} mmol/L`;
}
