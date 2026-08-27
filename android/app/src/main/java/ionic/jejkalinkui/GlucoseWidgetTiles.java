package ionic.jejkalinkui;

import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;

/**
 * Bitmaps that match the Day page first tile (chart) and second tile (2×2 metrics).
 */
final class GlucoseWidgetTiles {
    private static final int COLOR_SURFACE = 0xFFFFFFFF;
    private static final int COLOR_INK = 0xFF15213B;
    private static final int COLOR_MUTED = 0xFF707C91;
    private static final int COLOR_LINE = 0xFFE3E7ED;
    private static final int COLOR_GAP = 0xFFDDE2E9;
    private static final int COLOR_BAND = 0xD9E9F5F3;
    private static final int COLOR_TEAL = 0xFF0E9B8A;
    private static final int COLOR_LOW = 0xFFC2255C;
    private static final int COLOR_VERY_LOW = 0xFF9B1B47;
    private static final int COLOR_HIGH = 0xBFC77C1E;
    private static final int COLOR_AMBER = 0xFFC77C1E;
    private static final float LOW = 3.9f;
    private static final float HIGH = 10.0f;
    private static final float VERY_LOW = 3.0f;
    private static final long GAP_MS = 10L * 60L * 1000L;

    private GlucoseWidgetTiles() {}

    static class Pt {
        long t;
        float mmol;
        Pt(long t, float mmol) {
            this.t = t;
            this.mmol = mmol;
        }
    }

    static class Seg {
        long from;
        long to;
        boolean covered;
        Seg(long from, long to, boolean covered) {
            this.from = from;
            this.to = to;
            this.covered = covered;
        }
    }

    static Bitmap dayChart(SharedPreferences prefs) {
        List<Pt> points = parseTimedPoints(prefs.getString("sparkline_points", ""));
        long dayStart = prefs.getLong("sparkline_day_start_ms", 0);
        if (dayStart <= 0) dayStart = localMidnight();
        long dayEnd = prefs.getLong("sparkline_day_end_ms", 0);
        if (dayEnd <= dayStart) dayEnd = endOfLocalDay(dayStart);
        long now = System.currentTimeMillis();
        long plotEnd = Math.min(Math.max(now, dayStart + 60_000L), dayEnd);
        if (prefs.getLong("sparkline_plot_end_ms", 0) > dayStart) {
            plotEnd = Math.min(Math.max(prefs.getLong("sparkline_plot_end_ms", 0), dayStart + 60_000L), dayEnd);
        }

        String title = prefs.getString("sparkline_label", "");
        if (title == null || title.isEmpty()) title = "Today · glucose";

        int w = 960;
        int h = 520;
        int pad = 28;
        int titleH = 36;
        int covH = 52;
        int padL = 72;
        int padR = 16;
        int plotTop = pad + titleH;
        int plotBot = h - pad - covH;

        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);
        canvas.drawColor(COLOR_SURFACE);

        Paint titlePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        titlePaint.setColor(COLOR_INK);
        titlePaint.setTextSize(26f);
        titlePaint.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        canvas.drawText(title, pad, pad + 24, titlePaint);

        float[] mmol = new float[points.size()];
        for (int i = 0; i < points.size(); i++) mmol[i] = points.get(i).mmol;
        float[] domain = computeYDomain(mmol);
        float yMin = domain[0];
        float yMax = domain[1];
        float plotW = w - padL - padR;
        long span = Math.max(1L, plotEnd - dayStart);

        Paint band = new Paint(Paint.ANTI_ALIAS_FLAG);
        band.setColor(COLOR_BAND);
        float bandTop = mapY(HIGH, plotBot, plotTop, yMin, yMax);
        float bandBot = mapY(LOW, plotBot, plotTop, yMin, yMax);
        canvas.drawRect(padL, Math.min(bandTop, bandBot), w - padR, Math.max(bandTop, bandBot), band);

        Paint grid = new Paint(Paint.ANTI_ALIAS_FLAG);
        grid.setColor(COLOR_LINE);
        grid.setStrokeWidth(2f);
        canvas.drawLine(padL, bandTop, w - padR, bandTop, grid);
        canvas.drawLine(padL, bandBot, w - padR, bandBot, grid);

        Paint yLabel = new Paint(Paint.ANTI_ALIAS_FLAG);
        yLabel.setColor(COLOR_MUTED);
        yLabel.setTextSize(17f);
        yLabel.setTextAlign(Paint.Align.RIGHT);
        canvas.drawText("3.9", padL - 8, bandBot + 6, yLabel);
        canvas.drawText("10.0", padL - 8, bandTop + 6, yLabel);
        if (Math.abs(yMax - HIGH) > 0.2f) {
            canvas.drawText(fmtTick(yMax), padL - 8, plotTop + 14, yLabel);
        }
        if (Math.abs(yMin - LOW) > 0.2f) {
            canvas.drawText(fmtTick(yMin), padL - 8, plotBot, yLabel);
        }

        List<Seg> plotGaps = gapsInWindow(points, dayStart, plotEnd);
        Paint hatch = hatchPaint();
        Paint gapWord = new Paint(Paint.ANTI_ALIAS_FLAG);
        gapWord.setColor(COLOR_MUTED);
        gapWord.setTextSize(17f);
        int gapLabels = 0;
        for (Seg g : plotGaps) {
            if (g.covered) continue;
            float x0 = padL + (g.from - dayStart) / (float) span * plotW;
            float x1 = padL + (g.to - dayStart) / (float) span * plotW;
            if (x1 <= x0) continue;
            canvas.drawRect(x0, plotTop, x1, plotBot, hatch);
            if (gapLabels < 4 && x1 - x0 > 36) {
                canvas.drawText("gap", x0 + 4, plotTop + 22, gapWord);
                gapLabels++;
            }
        }

        if (points.size() >= 2) {
            Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
            line.setStyle(Paint.Style.STROKE);
            line.setStrokeWidth(3.8f);
            line.setColor(COLOR_INK);
            line.setStrokeCap(Paint.Cap.ROUND);
            line.setStrokeJoin(Paint.Join.ROUND);
            Path path = new Path();
            boolean started = false;
            for (int i = 0; i < points.size(); i++) {
                if (points.get(i).t > plotEnd) break;
                if (i > 0 && points.get(i).t - points.get(i - 1).t > GAP_MS) started = false;
                float x = padL + (points.get(i).t - dayStart) / (float) span * plotW;
                float y = mapY(points.get(i).mmol, plotBot, plotTop, yMin, yMax);
                if (!started) {
                    path.moveTo(x, y);
                    started = true;
                } else {
                    path.lineTo(x, y);
                }
            }
            canvas.drawPath(path, line);

            Paint pt = new Paint(Paint.ANTI_ALIAS_FLAG);
            for (int i = 0; i < points.size(); i++) {
                if (points.get(i).t > plotEnd) break;
                float v = points.get(i).mmol;
                if (v >= LOW && v <= HIGH) continue;
                float x = padL + (points.get(i).t - dayStart) / (float) span * plotW;
                float y = mapY(v, plotBot, plotTop, yMin, yMax);
                if (v < VERY_LOW) pt.setColor(COLOR_VERY_LOW);
                else if (v < LOW) pt.setColor(COLOR_LOW);
                else pt.setColor(COLOR_HIGH);
                canvas.drawCircle(x, y, v < LOW ? 4.2f : 3.4f, pt);
            }

            Pt last = lastAtOrBefore(points, plotEnd);
            if (last != null) {
                float lastX = padL + (last.t - dayStart) / (float) span * plotW;
                float lastY = mapY(last.mmol, plotBot, plotTop, yMin, yMax);
                Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
                ring.setColor(0xFFFFFFFF);
                canvas.drawCircle(lastX, lastY, 8f, ring);
                Paint lastP = new Paint(Paint.ANTI_ALIAS_FLAG);
                lastP.setColor(COLOR_TEAL);
                canvas.drawCircle(lastX, lastY, 5.5f, lastP);
            }
        }

        Paint xPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        xPaint.setColor(COLOR_MUTED);
        xPaint.setTextSize(17f);
        xPaint.setTextAlign(Paint.Align.CENTER);
        long plotSpan = plotEnd - dayStart;
        if (plotSpan >= 20L * 60L * 60L * 1000L) {
            int[] hours = { 0, 6, 12, 18, 24 };
            for (int hr : hours) {
                float x = padL + hr / 24f * plotW;
                canvas.drawText(String.format(Locale.UK, "%02d", hr), x, plotBot + 22, xPaint);
            }
        } else {
            int ticks = 5;
            for (int i = 0; i < ticks; i++) {
                long t = dayStart + plotSpan * i / (ticks - 1);
                float x = padL + (t - dayStart) / (float) span * plotW;
                canvas.drawText(hhmm(t), x, plotBot + 22, xPaint);
            }
        }

        List<Seg> dayGaps = gapsInWindow(points, dayStart, dayEnd);
        float barY = h - pad - 28;
        float barH = 10f;
        float barL = pad;
        float barR = w - pad;
        Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
        track.setColor(COLOR_GAP);
        canvas.drawRoundRect(barL, barY, barR, barY + barH, 6f, 6f, track);
        long daySpan = Math.max(1L, dayEnd - dayStart);
        Paint on = new Paint(Paint.ANTI_ALIAS_FLAG);
        on.setColor(COLOR_TEAL);
        for (Seg s : dayGaps) {
            if (!s.covered) continue;
            float x0 = barL + (s.from - dayStart) / (float) daySpan * (barR - barL);
            float x1 = barL + (s.to - dayStart) / (float) daySpan * (barR - barL);
            canvas.drawRect(x0, barY, x1, barY + barH, on);
        }

        Paint meta = new Paint(Paint.ANTI_ALIAS_FLAG);
        meta.setColor(COLOR_MUTED);
        meta.setTextSize(20f);
        meta.setTextAlign(Paint.Align.LEFT);
        canvas.drawText("00:00–24:00", barL, h - pad + 4, meta);
        meta.setTextAlign(Paint.Align.RIGHT);
        canvas.drawText(coverageCaption(dayGaps, dayStart, dayEnd), barR, h - pad + 4, meta);

        return bmp;
    }

    static Bitmap dayMetrics(SharedPreferences prefs) {
        String tir = nz(prefs.getString("day_tir", null), "--");
        String mean = nz(prefs.getString("day_mean", null), "--");
        String below = nz(prefs.getString("day_below", null), "--");
        String above = nz(prefs.getString("day_above", null), "--");
        String vlow = nz(prefs.getString("day_very_low", null), "--");
        String vhigh = nz(prefs.getString("day_very_high", null), "--");
        boolean has = prefs.getString("sparkline_points", null) != null
            && !prefs.getString("sparkline_points", "").isEmpty();
        if (!has) {
            tir = mean = below = above = "--";
            vlow = vhigh = "--";
        }

        int w = 960;
        int h = 400;
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);
        Path clip = new Path();
        clip.addRoundRect(new RectF(0, 0, w, h), 42f, 42f, Path.Direction.CW);
        canvas.clipPath(clip);
        canvas.drawColor(COLOR_LINE);

        float gap = 3f;
        float cellW = (w - gap) / 2f;
        float cellH = (h - gap) / 2f;
        drawMetricCell(canvas, 0, 0, cellW, cellH, "IN RANGE", has ? tir : "--", has ? "%" : "",
            "3.9–10.0", COLOR_INK, COLOR_MUTED);
        drawMetricCell(canvas, cellW + gap, 0, cellW, cellH, "MEAN", has ? mean : "--", "",
            "mmol/L", COLOR_INK, COLOR_MUTED);
        drawMetricCell(canvas, 0, cellH + gap, cellW, cellH, "BELOW 3.9", has ? below : "--", has ? "%" : "",
            has ? vlow + "% under 3.0" : "under 3.0", COLOR_LOW, COLOR_LOW);
        drawMetricCell(canvas, cellW + gap, cellH + gap, cellW, cellH, "ABOVE 10.0", has ? above : "--", has ? "%" : "",
            has ? vhigh + "% over 13.9" : "over 13.9", COLOR_AMBER, COLOR_LOW);
        return bmp;
    }

    private static void drawMetricCell(
        Canvas canvas, float x, float y, float w, float h,
        String key, String value, String suffix, String delta, int valueColor, int deltaColor
    ) {
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(COLOR_SURFACE);
        canvas.drawRect(x, y, x + w, y + h, bg);

        float px = x + 28;
        float py = y + 28;
        Paint k = new Paint(Paint.ANTI_ALIAS_FLAG);
        k.setColor(COLOR_MUTED);
        k.setTextSize(19f);
        k.setLetterSpacing(0.1f);
        k.setTypeface(Typeface.MONOSPACE);
        canvas.drawText(key, px, py + 18, k);

        Paint v = new Paint(Paint.ANTI_ALIAS_FLAG);
        v.setColor(valueColor);
        v.setTextSize(46f);
        v.setFakeBoldText(true);
        v.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD));
        canvas.drawText(value, px, py + 72, v);
        if (suffix != null && !suffix.isEmpty() && !"--".equals(value)) {
            float vw = v.measureText(value);
            Paint s = new Paint(Paint.ANTI_ALIAS_FLAG);
            s.setColor(valueColor);
            s.setTextSize(26f);
            canvas.drawText(suffix, px + vw + 4, py + 68, s);
        }

        Paint d = new Paint(Paint.ANTI_ALIAS_FLAG);
        d.setColor(deltaColor);
        d.setTextSize(20f);
        d.setTypeface(Typeface.MONOSPACE);
        canvas.drawText(delta, px, py + 100, d);
    }

    private static Paint hatchPaint() {
        Bitmap tile = Bitmap.createBitmap(8, 8, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(tile);
        c.drawColor(0x59DDE2E9);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(0xB3C5CDD8);
        p.setStrokeWidth(2.2f);
        c.drawLine(0, 8, 8, 0, p);
        Paint out = new Paint(Paint.ANTI_ALIAS_FLAG);
        out.setShader(new BitmapShader(tile, Shader.TileMode.REPEAT, Shader.TileMode.REPEAT));
        return out;
    }

    private static List<Seg> gapsInWindow(List<Pt> points, long start, long end) {
        List<Seg> segs = new ArrayList<>();
        List<Pt> in = new ArrayList<>();
        for (Pt p : points) {
            if (p.t >= start && p.t <= end) in.add(p);
        }
        if (in.isEmpty()) {
            segs.add(new Seg(start, end, false));
            return segs;
        }
        if (in.get(0).t - start > GAP_MS) {
            segs.add(new Seg(start, in.get(0).t, false));
        } else if (in.get(0).t > start) {
            segs.add(new Seg(start, in.get(0).t, true));
        }
        for (int i = 0; i < in.size() - 1; i++) {
            long a = in.get(i).t;
            long b = in.get(i + 1).t;
            if (b - a > GAP_MS) segs.add(new Seg(a, b, false));
            else segs.add(new Seg(a, b, true));
        }
        long last = in.get(in.size() - 1).t;
        if (end - last > GAP_MS) segs.add(new Seg(last, end, false));
        else if (end > last) segs.add(new Seg(last, end, true));
        return merge(segs);
    }

    private static List<Seg> merge(List<Seg> segs) {
        List<Seg> out = new ArrayList<>();
        for (Seg s : segs) {
            if (s.to <= s.from) continue;
            if (!out.isEmpty() && out.get(out.size() - 1).covered == s.covered) {
                out.get(out.size() - 1).to = s.to;
            } else {
                out.add(new Seg(s.from, s.to, s.covered));
            }
        }
        return out;
    }

    private static String coverageCaption(List<Seg> segs, long start, long end) {
        long period = Math.max(1L, end - start);
        long covered = 0;
        long gapMs = 0;
        int gapCount = 0;
        for (Seg s : segs) {
            long dt = Math.max(0L, s.to - s.from);
            if (s.covered) covered += dt;
            else {
                gapMs += dt;
                gapCount++;
            }
        }
        float pct = Math.round(covered / (float) period * 1000f) / 10f;
        String pctS = pct == (long) pct
            ? String.format(Locale.US, "%.0f%%", pct)
            : String.format(Locale.US, "%.1f%%", pct);
        if (gapCount <= 0) return pctS;
        int gapMin = Math.round(gapMs / 60000f);
        int hh = Math.max(0, gapMin) / 60;
        int mm = Math.max(0, gapMin) % 60;
        return String.format(Locale.US, "%d gap · %02d:%02d · %s", gapCount, hh, mm, pctS);
    }

    private static float[] computeYDomain(float[] points) {
        if (points.length == 0) return new float[] { 3.0f, 12.0f };
        float dMin = points[0];
        float dMax = points[0];
        for (float p : points) {
            if (p < dMin) dMin = p;
            if (p > dMax) dMax = p;
        }
        float yMin = Math.min(dMin - 0.7f, LOW - 0.5f);
        float yMax = Math.max(dMax + 0.7f, HIGH + 0.6f);
        yMin = Math.max(2.0f, yMin);
        yMax = Math.min(22f, yMax);
        if (yMax - yMin < 6f) {
            float mid = (yMin + yMax) / 2f;
            yMin = Math.max(2.0f, mid - 3f);
            yMax = Math.min(22f, yMin + 6f);
            if (yMax - yMin < 6f) yMin = Math.max(2.0f, yMax - 6f);
        }
        yMin = (float) (Math.floor(yMin * 2) / 2.0);
        yMax = (float) (Math.ceil(yMax * 2) / 2.0);
        if (yMax <= yMin) yMax = yMin + 6f;
        return new float[] { yMin, yMax };
    }

    private static float mapY(float mmol, int bot, int top, float yMin, float yMax) {
        float usable = bot - top;
        return bot - ((mmol - yMin) / (yMax - yMin)) * usable;
    }

    private static String fmtTick(float v) {
        if (Math.abs(v - Math.round(v)) < 0.05f) return String.valueOf(Math.round(v));
        return String.format(Locale.US, "%.1f", v);
    }

    private static String hhmm(long ms) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(ms);
        return String.format(Locale.UK, "%02d:%02d", c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE));
    }

    private static long localMidnight() {
        Calendar c = Calendar.getInstance();
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        return c.getTimeInMillis();
    }

    private static long endOfLocalDay(long dayStart) {
        return dayStart + 24L * 60L * 60L * 1000L - 1L;
    }

    private static Pt lastAtOrBefore(List<Pt> points, long t) {
        Pt last = null;
        for (Pt p : points) {
            if (p.t <= t) last = p;
        }
        return last;
    }

    private static String nz(String s, String fallback) {
        return (s == null || s.isEmpty()) ? fallback : s;
    }

    static List<Pt> parseTimedPoints(String csv) {
        List<Pt> out = new ArrayList<>();
        if (csv == null || csv.isEmpty()) return out;
        if (csv.contains(";")) {
            for (String row : csv.split(";")) {
                String[] p = row.split(",");
                if (p.length < 2) continue;
                try {
                    long t = Long.parseLong(p[0].trim());
                    float v = Float.parseFloat(p[1].trim());
                    if (t > 0 && v > 0) out.add(new Pt(t, v));
                } catch (Exception ignored) {
                }
            }
        }
        return out;
    }
}
