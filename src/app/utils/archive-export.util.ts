import { MonthlyArchive } from '../analytics/archive';

export interface ArchiveExportBundle {
  exportedAt: string;
  patientLabel: string;
  hotRetentionDays: number;
  months: MonthlyArchive[];
}

export function buildArchiveJson(bundle: ArchiveExportBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export function buildArchiveHtml(bundle: ArchiveExportBundle): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const rows = bundle.months
    .map(
      (m) => `<tr>
        <td>${esc(m.month)}</td>
        <td>${m.readingCount}</td>
        <td>${m.coveragePct}%</td>
        <td>${m.tirPct}%</td>
        <td>${esc(m.meanLabel)}</td>
        <td>${esc(m.gmiLabel)}%</td>
        <td>${esc(m.cvLabel)}%</td>
        <td>${m.hypoEpisodes} · ${m.hypoMinutes} min</td>
      </tr>`
    )
    .join('');

  const patterns = bundle.months
    .filter((m) => m.patternLines.length)
    .map(
      (m) =>
        `<h3>${esc(m.month)}</h3><ul>${m.patternLines
          .map((p) => `<li>${esc(p)}</li>`)
          .join('')}</ul>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>JejkaLink archive</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; color: #1a1a1a; }
    h1 { font-size: 1.25rem; }
    .meta { color: #666; font-size: 0.9rem; margin-bottom: 1.5rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { text-align: left; padding: 0.35rem 0.4rem; border-bottom: 1px solid #eee; }
    th { font-weight: 600; }
    h3 { font-size: 0.95rem; margin: 1rem 0 0.35rem; }
    ul { font-size: 0.85rem; padding-left: 1.2rem; }
    .foot { margin-top: 1.5rem; font-size: 0.8rem; color: #888; }
  </style>
</head>
<body>
  <h1>Monthly glucose archive</h1>
  <div class="meta">${esc(bundle.patientLabel)} · exported ${esc(
    new Date(bundle.exportedAt).toLocaleString('en-GB')
  )} · hot window ${bundle.hotRetentionDays} days</div>
  <table>
    <tr>
      <th>Month</th><th>Readings</th><th>Coverage</th><th>TIR</th>
      <th>Mean</th><th>GMI</th><th>CV</th><th>Low episodes</th>
    </tr>
    ${rows}
  </table>
  ${patterns}
  <p class="foot">JejkaLink archive · descriptive summaries only · not for dosing decisions</p>
</body>
</html>`;
}

export function downloadTextFile(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
