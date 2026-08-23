# Screen specs

Visual reference: `cgm-companion-mockups.html`. Tokens: `tokens.css`. Rules: `CLAUDE.md`.

Build order is the order below. Each screen should work against the store before the
next one starts.

---

## Shared components

### CoverageStrip — the signature element

A 5px track under every chart and every aggregate metric block.

```
props: { segments: [{ from: Date, to: Date, covered: bool }], period: [Date, Date] }
```

- Covered runs render `--teal`, gaps render `--gap`.
- Caption line beneath, mono 10px: period on the left, coverage summary on the right.
- When gaps exist, prefix the summary in `--low`: `1 gap · 68 min · 94%`.
- This component appears on all five screens. It is the thing that makes the app
  trustworthy — do not make it optional or collapsible.

### MetricGrid

2-column grid, 1px `--line` gutters, no internal padding on the container.
Each cell: mono uppercase key (10px), tabular value (23px), delta or qualifier (10px).
Deltas colour `--teal` when improving, `--low` when worsening — improvement is
direction-dependent, so the metric definition owns that logic, not the component.

### GlucoseChart

- Target band `--band` from 3.9 to 10.0, drawn behind gridlines.
- Trace in `--ink`, 1.9–2.2px, round caps.
- Below-range points get a 2.1px `--low` dot; above-range get a smaller `--amber` dot
  at reduced opacity. High is common, low is what you scan for — the visual weight
  should reflect that.
- Gaps: hatched fill, no trace, labelled `gap`.
- Y axis labels only at 3.9, 10.0, and the ceiling. Nothing else earns the space.

---

## 01 · Now

The glanceable state. Should answer "is this fine, and is this current" in under a second.

- Hero: value at 62px mono, unit beside it, trend arrow right-aligned with slope caption.
- Chips row: range state, minutes since reading, 15-minute projection.
- Coverage strip for today.
- 3-hour sparkline.
- Recent events list — bolus, sync, resolved alarms.

The "read N min ago" chip escalates: `--muted` under 10 min, `--amber` 10–20, `--low`
over 20 with the stale-data alarm firing.

## 02 · Day

- Date stepper in the title bar.
- Full 24h chart with insulin boluses as bars along the baseline in `--indigo`,
  height proportional to units.
- Coverage strip spanning 00:00–24:00.
- MetricGrid: in range, mean, below 3.9 (with sub-3.0 as qualifier), above 10.0
  (with over-13.9 as qualifier).
- Day log: timestamped events including gap entries.

## 03 · Trends

- Period selector: 7 / 14 / 30 / 90.
- AGP: median trace with 25–75 and 10–90 percentile bands, bucketed by time of day
  using local-time offsets.
- Stacked range bar, five buckets, with a keyed legend showing exact percentages.
- MetricGrid: GMI, CV, mean, overnight TIR — each with delta vs previous period.
- Weekly read card (AI) at the bottom: two short paragraphs plus one question for the
  clinic, in a left-ruled quote block.

## 04 · Alarms

- Amber caveat card at the top. Non-dismissible.
- Thresholds section with steppers: low, urgent low, high, falling fast.
- Rules section with toggles: stale data, projection alerting, overnight profile,
  repeat until cleared.
- Fired-this-week log with real/false tagging.

## 05 · Settings

- Connection: session status, next refresh, poll interval, consecutive failures,
  30-day collector uptime strip.
- Data: readings stored, CSV backfill import, keep-raw toggle, clinic PDF export.
- Display: units (fixed mmol/L in v1), target range, week start.
- Analysis: weekly read schedule, unusual-day flagging.

---

## Copy rules

- Sentence case everywhere. No title case in the UI.
- Name things by what the user controls: "No data for 20 min", not "Stale threshold".
- Buttons say what happens: "Create", "Choose file". The result echoes the verb.
- Empty and error states explain what happened and what to do. They do not apologise
  and they are never vague.
