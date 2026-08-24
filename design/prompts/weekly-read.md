# Weekly read

## What runs today (no API key)

The **Weekly read** card on Trends is **100% local code** in `src/app/analytics/weekly-read.ts`.
It does not call Claude, OpenAI, or any external service.

Inputs:

- Period metrics (mean, GMI, CV, TIR, coverage, overnight TIR, …)
- Readings for the selected period → `detectTrendPatterns()` in `trend-patterns.ts`

Outputs:

- Two short descriptive paragraphs
- Bulleted **recurring windows** (time-of-day slots that go high or low on ≥25% of days)
- One clinic question (descriptive only — never dosing advice)

Enable in **Settings → Weekly read**.

## Optional future: LLM phrasing layer

The sketch below was written as a *future* idea — nicer prose from the same numbers.
If added later, the LLM would only **phrase** pre-computed metrics and patterns.
It would never compute metrics, decide alarms, or suggest insulin or pump settings.

### Hard rules (any LLM prompt)

- Descriptive language only: patterns, time-of-day tendencies, coverage caveats.
- NEVER suggest insulin doses, basal rates, carb ratios, correction factors, or pump setting changes.
- If asked for dosing advice, refuse and redirect to the clinic.
- Always cite coverage: if coverage is low, say the percentages are not comparable to a full week.

### Inputs for an LLM (if wired later)

- Period metrics JSON
- Pre-computed `TrendPattern[]` from analytics (not raw reading arrays)
- Optional carepartner annotations

### Output shape

1. Pattern summary (what stood out)
2. Coverage / uncertainty note
3. One clinic question
