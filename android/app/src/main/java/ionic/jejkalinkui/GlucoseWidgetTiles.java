package ionic.jejkalinkui;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;

import androidx.core.content.res.ResourcesCompat;

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

    private static volatile Typeface plexRegular;
    private static volatile Typeface plexSemi;

    private GlucoseWidgetTiles() {}

    private static Typeface plex(Context context, boolean semi) {
        if (plexRegular == null || plexSemi == null) {
            synchronized (GlucoseWidgetTiles.class) {
                if (plexRegular == null) {
                    plexRegular = loadFont(context, R.font.ibm_plex_mono_regular, Typeface.MONOSPACE);
                }
                if (plexSemi == null) {
                    plexSemi = loadFont(context, R.font.ibm_plex_mono_semibold,
                        Typeface.create(Typeface.MONOSPACE, Typeface.BOLD));
                }
            }
        }
        return semi ? plexSemi : plexRegular;
    }

    private static Typeface loadFont(Context context, int resId, Typeface fallback) {
        try {
            Typeface t = ResourcesCompat.getFont(context.getApplicationContext(), resId);
            return t != null ? t : fallback;
        } catch (Exception e) {
            return fallback;
        }
    }

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

    static Bitmap dayChart(Context context, SharedPreferences prefs) {
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

        // 4×2 ~250×110. Same edge pad as a metrics cell; no title / coverage.
        int w = 1000;
        int h = 440;
        float pad = metricsCellPad(w, h);
        float typeAxis = Math.max(12f, pad * (8.5f / 11f));
        float lineW = Math.max(1.2f, 1.15f * (h / 110f));
        float yLabelW = typeAxis * 3.4f;
        float xTickH = typeAxis * 1.25f;
        float plotL = pad + yLabelW;
        float plotR = w - pad;
        float plotTop = pad;
        float plotBot = h - pad - xTickH;
        float inner = Math.max(6f, 0.04f * (plotR - plotL));
        float lineL = plotL + inner;
        float lineR = plotR - inner;
        float lineWpx = lineR - lineL;
        float lineTop = plotTop + inner * 0.35f;
        float lineBot = plotBot - inner * 0.25f;

        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);
        Path clip = new Path();
        float radius = 14f / 324f * w;
        clip.addRoundRect(new RectF(0, 0, w, h), radius, radius, Path.Direction.CW);
        canvas.clipPath(clip);
        canvas.drawColor(COLOR_SURFACE);

        Typeface axisFace = plex(context, false);
        float[] mmol = new float[points.size()];
        for (int i = 0; i < points.size(); i++) mmol[i] = points.get(i).mmol;
        float[] domain = computeYDomain(mmol);
        float yMin = domain[0];
        float yMax = domain[1];
        long span = Math.max(1L, dayEnd - dayStart);

        Paint band = new Paint(Paint.ANTI_ALIAS_FLAG);
        band.setColor(COLOR_BAND);
        float bandTop = mapY(HIGH, lineBot, lineTop, yMin, yMax);
        float bandBot = mapY(LOW, lineBot, lineTop, yMin, yMax);
        canvas.drawRect(lineL, Math.min(bandTop, bandBot), lineR, Math.max(bandTop, bandBot), band);

        Paint grid = new Paint(Paint.ANTI_ALIAS_FLAG);
        grid.setColor(COLOR_LINE);
        grid.setStrokeWidth(Math.max(1f, lineW * 0.55f));
        canvas.drawLine(lineL, bandTop, lineR, bandTop, grid);
        canvas.drawLine(lineL, bandBot, lineR, bandBot, grid);

        Paint yLabel = new Paint(Paint.ANTI_ALIAS_FLAG);
        yLabel.setColor(COLOR_MUTED);
        yLabel.setTextSize(typeAxis);
        yLabel.setTypeface(axisFace);
        yLabel.setTextAlign(Paint.Align.RIGHT);
        float yLabelX = lineL - inner * 0.45f;
        canvas.drawText("3.9", yLabelX, bandBot + typeAxis * 0.35f, yLabel);
        canvas.drawText("10.0", yLabelX, bandTop + typeAxis * 0.35f, yLabel);
        if (Math.abs(yMax - HIGH) > 0.2f) {
            canvas.drawText(fmtTick(yMax), yLabelX, lineTop + typeAxis, yLabel);
        }
        if (Math.abs(yMin - LOW) > 0.2f) {
            canvas.drawText(fmtTick(yMin), yLabelX, lineBot, yLabel);
        }

        List<Seg> plotGaps = gapsInWindow(points, dayStart, plotEnd);
        Paint hatch = hatchPaint();
        for (Seg g : plotGaps) {
            if (g.covered) continue;
            float x0 = mapX(g.from, dayStart, span, lineL, lineWpx);
            float x1 = mapX(g.to, dayStart, span, lineL, lineWpx);
            if (x1 <= x0) continue;
            canvas.drawRect(x0, lineTop, x1, lineBot, hatch);
        }

        if (points.size() >= 2) {
            Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
            line.setStyle(Paint.Style.STROKE);
            line.setStrokeWidth(lineW);
            line.setColor(COLOR_INK);
            line.setStrokeCap(Paint.Cap.ROUND);
            line.setStrokeJoin(Paint.Join.ROUND);
            Path path = new Path();
            boolean started = false;
            for (int i = 0; i < points.size(); i++) {
                if (points.get(i).t > plotEnd) break;
                if (i > 0 && points.get(i).t - points.get(i - 1).t > GAP_MS) started = false;
                float x = mapX(points.get(i).t, dayStart, span, lineL, lineWpx);
                float y = mapY(points.get(i).mmol, lineBot, lineTop, yMin, yMax);
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
                float x = mapX(points.get(i).t, dayStart, span, lineL, lineWpx);
                float y = mapY(v, lineBot, lineTop, yMin, yMax);
                if (v < VERY_LOW) pt.setColor(COLOR_VERY_LOW);
                else if (v < LOW) pt.setColor(COLOR_LOW);
                else pt.setColor(COLOR_HIGH);
                canvas.drawCircle(x, y, (v < LOW ? 1.6f : 1.3f) * (h / 220f), pt);
            }

            Pt last = lastAtOrBefore(points, plotEnd);
            if (last != null) {
                float lastX = mapX(last.t, dayStart, span, lineL, lineWpx);
                float lastY = mapY(last.mmol, lineBot, lineTop, yMin, yMax);
                float ringR = 2.4f * (h / 110f);
                Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
                ring.setColor(0xFFFFFFFF);
                canvas.drawCircle(lastX, lastY, ringR, ring);
                Paint lastP = new Paint(Paint.ANTI_ALIAS_FLAG);
                lastP.setColor(COLOR_TEAL);
                canvas.drawCircle(lastX, lastY, ringR * 0.64f, lastP);
            }
        }

        Paint xPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        xPaint.setColor(COLOR_MUTED);
        xPaint.setTextSize(typeAxis);
        xPaint.setTypeface(axisFace);
        float xTickY = plotBot + typeAxis * 1.05f;
        int[] hours = { 0, 6, 12, 18, 24 };
        for (int i = 0; i < hours.length; i++) {
            int hr = hours[i];
            long t = hr == 24 ? dayEnd : dayStart + hr * 3600_000L;
            float x = mapX(t, dayStart, span, lineL, lineWpx);
            if (i == 0) xPaint.setTextAlign(Paint.Align.LEFT);
            else if (i == hours.length - 1) xPaint.setTextAlign(Paint.Align.RIGHT);
            else xPaint.setTextAlign(Paint.Align.CENTER);
            canvas.drawText(String.format(Locale.UK, "%02d", hr), x, xTickY, xPaint);
        }

        return bmp;
    }

    static Bitmap dayMetrics(Context context, SharedPreferences prefs) {
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

        int w = 1000;
        int h = 440;
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);
        float radius = 14f / 324f * w;
        Path clip = new Path();
        clip.addRoundRect(new RectF(0, 0, w, h), radius, radius, Path.Direction.CW);
        canvas.clipPath(clip);
        canvas.drawColor(COLOR_LINE);

        float gap = Math.max(2f, 1f / 324f * w);
        float cellW = (w - gap) / 2f;
        float cellH = (h - gap) / 2f;
        Typeface regular = plex(context, false);
        Typeface semi = plex(context, true);
        drawMetricCell(canvas, 0, 0, cellW, cellH, "IN RANGE", has ? tir : "--", has ? "%" : "",
            "3.9–10.0", COLOR_INK, COLOR_MUTED, regular, semi);
        drawMetricCell(canvas, cellW + gap, 0, cellW, cellH, "MEAN", has ? mean : "--", "",
            "mmol/L", COLOR_INK, COLOR_MUTED, regular, semi);
        drawMetricCell(canvas, 0, cellH + gap, cellW, cellH, "BELOW 3.9", has ? below : "--", has ? "%" : "",
            has ? vlow + "% under 3.0" : "under 3.0", COLOR_LOW, COLOR_LOW, regular, semi);
        drawMetricCell(canvas, cellW + gap, cellH + gap, cellW, cellH, "ABOVE 10.0", has ? above : "--", has ? "%" : "",
            has ? vhigh + "% over 13.9" : "over 13.9", COLOR_AMBER, COLOR_LOW, regular, semi);
        return bmp;
    }

    /**
     * Equal pad on top / left / bottom. Type uses tight line boxes (not full
     * FontMetrics) so MEAN / 7.4 / mmol stay dense and the bottom pad survives.
     */
    private static void drawMetricCell(
        Canvas canvas, float x, float y, float w, float h,
        String key, String value, String suffix, String delta, int valueColor, int deltaColor,
        Typeface regular, Typeface semi
    ) {
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(COLOR_SURFACE);
        canvas.drawRect(x, y, x + w, y + h, bg);

        float pad = 0.15f * Math.min(w, h);
        float gapKv = 0.012f * h;
        float gapVd = 0.008f * h;
        float innerH = h - 2f * pad;
        float typeBudget = Math.max(8f, innerH - gapKv - gapVd);
        float unit = typeBudget / (9.5f + 23f + 10f);
        float keyH = 9.5f * unit;
        float valH = 23f * unit;
        float deltaH = 10f * unit;
        float sufH = 13f / 23f * valH;

        Paint k = new Paint(Paint.ANTI_ALIAS_FLAG);
        k.setColor(COLOR_MUTED);
        k.setTextSize(keyH);
        k.setLetterSpacing(0.1f);
        k.setTypeface(regular);

        Paint v = new Paint(Paint.ANTI_ALIAS_FLAG);
        v.setColor(valueColor);
        v.setTextSize(valH);
        v.setLetterSpacing(-0.02f);
        v.setTypeface(semi);

        Paint suf = new Paint(Paint.ANTI_ALIAS_FLAG);
        suf.setColor(valueColor);
        suf.setTextSize(sufH);
        suf.setTypeface(regular);

        Paint d = new Paint(Paint.ANTI_ALIAS_FLAG);
        d.setColor(deltaColor);
        d.setTextSize(deltaH);
        d.setTypeface(regular);

        float cx = x + pad;
        float keyTop = y + pad;
        canvas.drawText(key, cx, keyTop + keyH * 0.82f, k);
        float valTop = keyTop + keyH + gapKv;
        float valBaseline = valTop + valH * 0.82f;
        canvas.drawText(value, cx, valBaseline, v);
        if (suffix != null && !suffix.isEmpty() && !"--".equals(value)) {
            canvas.drawText(suffix, cx + v.measureText(value) + 0.04f * w, valBaseline, suf);
        }
        float deltaTop = valTop + valH + gapVd;
        canvas.drawText(delta, cx, deltaTop + deltaH * 0.82f, d);
    }

    /** Same inset the 2×2 metric cells use (15% of the shorter cell side). */
    private static float metricsCellPad(int w, int h) {
        float gap = Math.max(2f, 1f / 324f * w);
        float cellW = (w - gap) / 2f;
        float cellH = (h - gap) / 2f;
        return 0.15f * Math.min(cellW, cellH);
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

    private static float mapX(long t, long start, long span, float left, float width) {
        return left + (t - start) / (float) span * width;
    }

    private static float mapY(float mmol, float bot, float top, float yMin, float yMax) {
        float usable = bot - top;
        return bot - ((mmol - yMin) / (yMax - yMin)) * usable;
    }

    private static String fmtTick(float v) {
        if (Math.abs(v - Math.round(v)) < 0.05f) return String.valueOf(Math.round(v));
        return String.format(Locale.US, "%.1f", v);
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
