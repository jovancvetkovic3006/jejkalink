# Migration audit

For an existing app. Work top to bottom — the early items are the ones that make later
work throwaway if skipped.

## 1 · Units audit (do this first)

Grep the codebase for numeric glucose constants and check each one.

```
rg -n '\b(70|80|180|54|250|140)\b'          # likely mg/dL thresholds
rg -n '18\.0182|18\.018|/ ?18\b'            # existing conversions
rg -n 'mgdl|mg_dl|mgDl|mmol' -i
```

- [ ] Every threshold constant moved to one module, expressed in mmol/L
- [ ] Conversion happens once, at the collector boundary, and nowhere else
- [ ] Storage column is `numeric(4,1)` or `Decimal`, not float/real
- [ ] GMI uses the mmol equation `12.71 + 4.70587 × mean`, not a converted mg/dL one
- [ ] Display formatter enforces one decimal in a single place

## 2 · Schema changes

- [ ] `readings` has UTC timestamp **and** local UTC offset columns
- [ ] Unique constraint on `(patient_id, timestamp, reading_type)`, writes are upserts
- [ ] Raw response bodies retained — blob column or file per fetch
- [ ] Gap representation exists: either explicit gap rows or a derived-gaps function
      with a documented threshold (>10 min between readings)
- [ ] `events` table covers bolus, carbs, basal changes, sensor state
- [ ] `alarms_fired` table: timestamp, rule, causing reading, user tag (real/false/null)
- [ ] `annotations` table: date, freeform text — needed before any AI feature works

## 3 · Collector

- [ ] Token refresh writes to disk on every refresh, not only in memory
- [ ] Restart recovers from persisted token without a browser session
- [ ] Refresh failure raises an alert rather than failing silently
- [ ] Exponential backoff with a hard stop after N failures
- [ ] Poll schedule phase-aligns to observed reading timestamps
- [ ] Backfill path from CareLink CSV export

## 4 · Extract the analytics layer

If metrics are currently computed inside components or route handlers, pull them out.

- [ ] Pure module, no I/O, no clock reads, no network
- [ ] Signature `(readings, events, period) → metrics`
- [ ] Every percentage returns its coverage denominator alongside it
- [ ] Unit tests with fixture days: a clean day, a gappy day, a DST day, an all-low day
- [ ] Components import from here and compute nothing themselves

This is the step that makes everything else cheap. Do not skip it.

## 5 · UI retrofit

- [ ] `tokens.css` imported, raw hex removed
- [ ] `CoverageStrip` built and placed under every chart and metric block
- [ ] Charts stop interpolating across gaps — hatched fill instead
- [ ] All numerals switched to mono with `tabular-nums`
- [ ] Low points weighted more heavily than high points on charts
- [ ] Stale-reading chip on the Now screen escalates by colour at 10 and 20 minutes

## 6 · Alarms

- [ ] Evaluation uses reading timestamp, not fetch time
- [ ] Stale-data rule exists and is treated as urgent
- [ ] Hysteresis on the low rule (3.9 fire / 4.4 clear)
- [ ] Urgent low bypasses snooze
- [ ] Delivery channel bypasses Do Not Disturb — test at 2am before relying on it
- [ ] Every fire is logged and taggable

## 7 · AI layer (last)

- [ ] Prompts in version-controlled files, not inline strings
- [ ] Model receives layer-3 aggregates plus annotations — never raw readings
- [ ] Scheduled jobs use the batch API; nothing here is latency-sensitive
- [ ] Weekly read is cached, not regenerated on screen open
- [ ] Anomaly detection is statistical; the model is only called once something crosses
      a threshold
- [ ] Output rendered in the indigo treatment, timestamped, with source aggregates
      reachable
- [ ] No code path can produce a dosing suggestion

## Sequencing note

Items 1 and 2 are destructive to redo later. Get them right before building screens on
top of the schema.
