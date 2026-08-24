# JejkaLink · functional plan

Status against **v1.14** UI + cgm-core architecture.  
Core collector, alarm, and analytics paths are wired. Remaining gaps are polish (snooze, richer CareLink markers, AI annotations UI).

---

## Bottom line

The app is **functionally complete** for single-tenant follower use:

- **History / metrics / events / Ionic alarms** update when the process is alive (FGS keeps polling after swipe-away).
- **Force-stop** still kills everything until the user opens the app again.
- **Snooze**, richer CareLink marker ingestion, and annotations UI remain future work.

---

## Fix first (priority map)

### Blockers

1. **Bridge `onDataFetched` → Ionic stores** — **DONE (local)**  
   `AuthenticationService.ingestCareLinkPayload` + `AppComponent` listeners for `onDataFetched` / `onDataFetchError`. Merges history, events, raw, collector health; alarms still evaluate via `allSgs$`.  
   **Files:** `authentication.service.ts`, `app.component.ts`

2. **AlarmsService → real notifications** — **DONE (local)**  
   `evaluate()` delivers via `Background.fireAlarmAlert` (alert vs DND-bypass critical). Thresholds sync with `setAlarmThresholds`. Overnight low 4.2, high after 30 min, projection (toggle), falling-fast, stale ≥ 20 min. Ongoing notification uses user thresholds; headless low backup when bridge is gone (Step 3).  
   **Files:** `alarms.service.ts`, `background-web.service.ts`, `BackgroundPlugin.java`

3. **Actually start `ForegroundService`** — **DONE (local)**  
   Real `ForegroundService` (`dataSync`) with `startForeground`, `START_STICKY`, and poll scheduler owned statically so it survives Activity/WebView teardown. `startPolling` starts the FGS; notification Refresh triggers an immediate poll. Headless low/urgent backup when Ionic bridge is gone.  
   **Files:** `ForegroundService.java`, `BackgroundPlugin.java`, `AndroidManifest.xml`

### Important

4. Wire **poll interval / phase-align / backoff** — **DONE (local)**  
   `setCollectorConfig` from Settings; phase-aligned scheduler (:02 + 30s / last reading); exponential backoff + alert at N failures (Ionic + native).  
5. Pass **patientUsername** into Android plugin — **DONE (local)**  
   Via `setCollectorConfig`; persisted in plugin prefs.  
6. **CSV import**, **PDF export**, **weekly read** — **DONE (local)**  
   CSV → `parseCareLinkCsv` + merge; clinic HTML report download; deterministic weekly read when toggle on.  
7. Write **gap events** from `detectGaps` — **DONE (local)**  
   `EventsStore.syncGapsForRange` on Day refresh.  
8. Settings **target low/high** in `periodMetrics` — **DONE (local)**  
   Day + Trends pass targets; overnight label **22:00–07:00** aligned with code.  
9. English status-alert copy — **DONE (local)**  
   `checkStatusAlerts` reservoir/sensor/battery strings.

### Nice-to-have

10. ~~Multi-blob raw archive; real collector-uptime strip; week-start usage; unusual-day flagging; DST-aware AGP via stored `utcOffsetMin`.~~ — **DONE (local)**  
    Remaining: annotations UI, snooze, richer marker ingestion, time-weighted range bars on Trends (bars still sample-based).

### Suggested build order

1. Data bridge from background polls  
2. Alarm delivery from user thresholds  
3. Collector scheduling (5m + phase + backoff)  
4. Richer events (gaps, more markers)  
5. Weekly read / CSV / PDF  

---

## 1. Collector / CareLink data path

| Item | State | Severity | Notes |
|------|--------|----------|-------|
| OAuth login + code exchange | Works | — | `authentication.service.ts` |
| Discovery of EU endpoints | Works | — | `medtronic-discovery.service.ts` |
| Fetch + merge SGs (foreground) | Works | — | `processPatientData` → `SgsHistoryService.merge` |
| Background → Ionic history | **Done (local)** | Was blocker | `ingestCareLinkPayload` via `onDataFetched`; needs FGS for killed-app reliability |
| Token refresh to disk | Works | — | Plugin `persistTokens` + Ionic `localStorage` |
| Background-only OAuth refresh | Works | — | Plugin owns rotation |
| Poll interval 5 min | **Done (local)** | — | Settings → `setCollectorConfig` |
| Phase-align to sensor writes | **Done (local)** | — | :02 + 30s; drift-correct from last reading |
| Exponential backoff + hard stop | **Done (local)** | — | Native + Ionic alert at `failureAlertAt` |
| Upsert key | **Done (local)** | — | `patientUsername|timestamp` |
| Raw retention | **Done (local)** | — | Rolling archive (48 blobs) when `keepRaw` |
| CSV backfill | **Done (local)** | — | Settings file picker → merge |

**Key files:** `authentication.service.ts`, `sgs-history.service.ts`, `collector-health.service.ts`, `app.component.ts`, `ionic.jejkalinkui.plugins.background/.../BackgroundPlugin.java`

---

## 2. Now page

| Feature | State | Severity | Notes |
|---------|--------|----------|-------|
| Live value (mmol/L, 1 decimal) | Works | — | Last history reading |
| Trend arrow | Partial | Important | UP/DOWN only; slope caption from last two points |
| 15‑min projection chip | Works (display) | — | Local slope; not CareLink |
| Stale chip | Works | — | |
| Coverage today | Works | — | `detectGaps` |
| 3h sparkline + gaps | Works | — | |
| Recent events | Partial | Important | Only ingested markers; empty → mock placeholders |
| Empty glass states | Works | — | Blur + “No data yet” |

**Key files:** `now.page.ts`, `placeholder-data.util.ts`, `glucose-slope.util.ts`

---

## 3. Day page

| Feature | State | Severity | Notes |
|---------|--------|----------|-------|
| Calendar / day stepper + swipe | Works | — | |
| 24h chart + gap hatching | Works | — | |
| Bolus bars | Partial | Important | Only if CareLink markers parsed |
| MetricGrid | **Done (local)** | — | Uses Settings target band |
| Day log events | **Done (local)** | — | Gap rows from `syncGapsForRange` |
| Events-only refresh | **Done (local)** | — | Subscribes to `events$` + `allSgs$` |

### CareLink markers — ingested

- Sensor disconnect (`conduitSensorInRange === false`)
- Temp basal banner
- Suspended on/before low
- Bolus-like markers with amount (+ optional carbs detail)
- Synthetic sync (~5 min bucket)

### Not ingested

Gaps, warmup, calibration, basal schedule edits, carbs-only meals, most pump alarms, auto mode / SmartGuard detail.

**Key files:** `day.page.ts`, `events-store.service.ts`, `analytics/metrics.ts`

---

## 4. Trends page

| Feature | State | Severity | Notes |
|---------|--------|----------|-------|
| Period 7 / 14 / 30 / 90 | Works | — | |
| AGP median + bands | Works | — | Needs ≥2 points per 30‑min slot |
| AGP DST / `utcOffsetMin` | **Done (local)** | — | AGP buckets use capture-time offset |
| Stacked TIR bars | Works | — | Uses Settings targets |
| GMI / CV / mean / overnight TIR | Works | — | Overnight **22:00–07:00** (UI + code) |
| Weekly read | **Done (local)** | — | `buildWeeklyRead` when Settings toggle on |

**Key files:** `trends.page.ts`, `analytics/agp.ts`, `analytics/metrics.ts`

---

## 5. How to read the Trends AGP chart

Label in UI: **Typical day · median & spread**.

This is an **AGP (Ambulatory Glucose Profile)** — **not** one day’s line. It folds many days in the selected period into one “typical day” from midnight to midnight.

### How it’s built

1. Take every reading in the period (7 / 14 / 30 / 90 days).
2. Bucket by **time of day** (every 30 minutes).
3. At each clock slot, compute percentiles across all days that contributed values.

### What you see

| Visual | Meaning |
|--------|---------|
| **Dark line** | **Median** — middle value at that hour. Half of days above, half below. “Usual level around this time.” |
| **Darker inner band** | **25th–75th percentile** — middle half of days. Narrow = consistent; wide = that hour varies a lot day to day. |
| **Lighter outer band** (“shadow”) | **10th–90th percentile** — common range, ignoring wildest extremes. |

### How to use it

- Follow the **line** for the typical daily shape (overnight low, breakfast rise, evening peak).
- Use **band width** for reliability: thin = predictable; fat = chaotic.
- Compare to the **green target band** (Settings low–high): median inside = usual day in range; fat outer shadow sticking out = some days still swing high/low.

**Example:** fat shadow at 09:00 with median still in range → breakfast often fine on average, but some mornings swing much higher or lower.

Code: `src/app/analytics/agp.ts`, `src/app/components/agp-chart/agp-chart.component.ts`  
Spec: `design/SCREENS.md` — median + 25–75 and 10–90 bands.

---

## 6. Alarms

| Feature | State | Severity | Notes |
|---------|--------|----------|-------|
| Threshold steppers persist | Works | — | Synced to native prefs |
| Evaluate on reading timestamp | **Done (local)** | Was blocker | `fireAlarmAlert` + fired log |
| Stale ≥ 20 min | **Done (local)** | Was blocker | Critical channel; needs live WebView |
| Low hysteresis 3.9 / clear 4.4 | Works | — | Delivered; no snooze UI yet |
| Urgent low ignores snooze | Partial | Important | Always critical; no snooze system yet |
| High “after 30 min” | **Done (local)** | — | Hold timer on consecutive highs |
| Projection alerting | **Done (local)** | — | 15‑min forecast when toggle on |
| Overnight profile | **Done (local)** | — | 22:00–07:00 · low 4.2 |
| Repeat until cleared | Partial | Important | Re-fire while low + 15‑min dedupe |
| Fired log | Works | — | |
| Real/False tagging | Removed from UI | — | Service still has `tag()` |
| DND bypass | **Done (local)** | — | Critical channel for urgent/stale/projection/low |
| Native threshold sync | **Done (local)** | — | `setAlarmThresholds`; ongoing bar uses prefs |

**Key files:** `alarms.service.ts`, `alarms.page.ts`, `BackgroundPlugin.java`, `app.component.ts`

---

## 7. Settings — persist vs effect

| Control | Persists? | Does something? |
|---------|-----------|-----------------|
| CareLink session status | Derived | Yes |
| Poll interval | Yes | Yes — synced to plugin |
| Consecutive failures / alert after N | Yes | Yes — native + Ionic notify |
| Patient username | Yes | Yes — plugin + Ionic |
| Collector uptime 30d strip | — | Poll success log (not glucose gaps) |
| Readings stored count | — | Yes |
| Import CareLink CSV | — | **Done (local)** |
| Keep raw | Yes | Yes — rolling archive |
| Export clinic PDF | — | **Done (local)** (HTML → Print to PDF) |
| Units mmol/L | Fixed | OK |
| Target low/high | Yes | Charts/AGP/TIR/Day metrics |
| Week starts | Yes | Trends 7/14-day alignment |
| Weekly read toggle | Yes | Trends card when on |
| Flag unusual days | Yes | Day status + Trends period pill |
| Logs / send / clear / sign out | — | Work |

---

## 8. Android native

| Piece | State | Severity | Notes |
|-------|--------|----------|-------|
| Background poll | Works | — | Phase-aligned; interval from Settings |
| Token refresh + persist | Works | — | |
| Ongoing glucose notification | Works | — | mmol via `÷ 18.0182` |
| Critical low + DND | Works | — | Ionic rules + headless backup |
| Status alerts (reservoir/sensor/battery) | Works | — | |
| Home widget | Works | — | |
| ForegroundService start | **Done (local)** | Was blocker | Real FGS + sticky poll |
| Notification “refresh” action | **Done (local)** | — | FGS listens for `TRIGGER_REFRESH` |
| `onDataFetched` → Ionic | **Done (local)** | — | While bridge alive |
| Patient ID in plugin | **Done (local)** | — | `setCollectorConfig.patientUsername` |

---

## 9. Analytics layer

### Present and used

- `detectGaps` / coverage — Now, Day, Trends, Settings “uptime”
- `periodMetrics` — mean, GMI, CV, TIR, below/above, overnight TIR
- `agpBuckets` — Trends
- Unit tests — clean / gappy / all-low (`metrics.spec.ts`); no DST fixture

### Missing vs SCREENS.md / cgm-core

| Gap | Severity | State |
|-----|----------|--------|
| Configurable target band in `periodMetrics` | — | **Done** |
| % over covered time (not sample count) | — | **Done** in `periodMetrics` |
| Tight range 3.9–7.8 metric | — | **Done** (`tightTirPct`) |
| Gap events as store rows | — | **Done** |
| Annotations table (for AI) | Important | Store only (`AnnotationsStore`); no UI |
| Unusual-day flagging | — | **Done** |
| Weekly-read generation | — | **Done** (deterministic) |
| DST / `utcOffsetMin` in AGP | — | **Done** |

---

## Performance notes (lists & charts)

- Long lists (Day log, Alarms fired, Settings logs) use **CDK virtual scroll** — only visible rows render.
- Glucose charts **downsample** by window length (≤240 pts for a day; ≤64 for sparkline) and cap gap annotations at 16.
- History merge no longer re-reads localStorage each poll; uses in-memory `allSgs$`.
- Trends / Day metrics use **`readingsInRange`** (binary search) instead of scanning all 90 days on every refresh.
- Day / Now charts show a **scrub title** that updates while the finger slides: `HH:MM · X.X mmol/L`.

## Already solid

- Five-tab UI aligned with mocks; CoverageStrip, MetricGrid, gap-aware charts
- mmol conversion at Ionic merge boundary + native `getLastGlicemia`
- Pure analytics module with GMI mmol formula and basic tests
- Widget + rich ongoing notification (user thresholds) + AlarmsService → OS alerts
- Token persistence and background refresh owned by the plugin
- Empty states: blur + “No data yet” on non-real surfaces (weekly read intentionally sharp)
- Background → Ionic history bridge (`ingestCareLinkPayload`) while process is alive
- Alarm rules: overnight / high-hold / projection / falling-fast / stale (process alive)
- Real `ForegroundService` keeps CareLink polling after swipe-away


---

## Reference

- Rules: `.cursor/rules/cgm-core.mdc`, `.cursor/rules/jejkalink.mdc`
- Screens: `design/SCREENS.md`
- Migration notes: `design/MIGRATION.md`
- Weekly-read prompt: `design/prompts/weekly-read.md`
- Canvas summary (optional): Cursor canvas `functional-gaps.canvas.tsx`
