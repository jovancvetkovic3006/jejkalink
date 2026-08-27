package ionic.jejkalinkui;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.util.Log;
import android.widget.RemoteViews;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;

/**
 * 4×2 — Day page first tile: last-reading title + today 00:00→now glucose chart.
 */
public class GlucoseWidgetChartProvider extends AppWidgetProvider {
    private static final String TAG = "GlucoseWidgetChart";

    private static final int COLOR_PAPER = 0xFFF6F7F9;
    private static final int COLOR_INK = 0xFF15213B;
    private static final int COLOR_BAND = 0xD9E9F5F3;
    private static final int COLOR_LINE = 0xFFE3E7ED;
    private static final int COLOR_MUTED = 0xFF707C91;
    private static final int COLOR_TEAL = 0xFF0E9B8A;
    private static final int COLOR_LOW = 0xFFC2255C;
    private static final int COLOR_VERY_LOW = 0xFF9B1B47;
    private static final int COLOR_HIGH = 0xFFC77C1E;
    private static final int COLOR_GAP = 0xFFDDE2E9;
    private static final float LOW = 3.9f;
    private static final float HIGH = 10.0f;
    private static final float VERY_LOW = 3.0f;
    private static final long GAP_MS = 10L * 60L * 1000L;

    private static class Pt {
        long t;
        float mmol;
        Pt(long t, float mmol) {
            this.t = t;
            this.mmol = mmol;
        }
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            update(context, appWidgetManager, id);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (GlucoseWidgetData.ACTION_UPDATE.equals(intent.getAction())) {
            AppWidgetManager mgr = AppWidgetManager.getInstance(context);
            ComponentName widget = new ComponentName(context, GlucoseWidgetChartProvider.class);
            for (int id : mgr.getAppWidgetIds(widget)) {
                update(context, mgr, id);
            }
        }
    }

    private void update(Context context, AppWidgetManager mgr, int appWidgetId) {
        try {
            SharedPreferences prefs = GlucoseWidgetData.prefs(context);
            String title = prefs.getString("sparkline_label", "");
            if (title == null || title.isEmpty()) {
                String g = prefs.getString("glucose_value", "--");
                title = (g == null || g.equals("--")) ? "Today · glucose" : g + " mmol/L";
            }
            String timeSince = GlucoseWidgetData.formatAge(prefs);

            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_glucose_chart);
            views.setTextViewText(R.id.widget_chart_title, title);
            views.setTextViewText(R.id.widget_time_since, timeSince);

            try {
                Bitmap spark = drawDayChart(
                    prefs.getString("sparkline_points", ""),
                    prefs.getLong("sparkline_day_start_ms", 0),
                    prefs.getLong("sparkline_day_end_ms", 0),
                    prefs.getString("day_coverage", "--")
                );
                if (spark != null) {
                    views.setImageViewBitmap(R.id.widget_sparkline, spark);
                }
            } catch (Exception e) {
                Log.w(TAG, "day chart draw failed", e);
            }

            Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            if (launch != null) {
                PendingIntent pi = PendingIntent.getActivity(
                    context, 2, launch,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                views.setOnClickPendingIntent(R.id.widget_root, pi);
            }
            mgr.updateAppWidget(appWidgetId, views);
        } catch (Exception e) {
            Log.e(TAG, "update failed; posting minimal widget", e);
            try {
                RemoteViews fallback = new RemoteViews(context.getPackageName(), R.layout.widget_glucose_chart);
                fallback.setTextViewText(R.id.widget_chart_title, "--");
                fallback.setTextViewText(R.id.widget_time_since, "");
                mgr.updateAppWidget(appWidgetId, fallback);
            } catch (Exception ignored) {
            }
        }
    }

    private static Bitmap drawDayChart(String csv, long startMs, long endMs, String coveragePct) {
        List<Pt> points = parseTimedPoints(csv);
        if (startMs <= 0) {
            Calendar c = Calendar.getInstance();
            c.set(Calendar.HOUR_OF_DAY, 0);
            c.set(Calendar.MINUTE, 0);
            c.set(Calendar.SECOND, 0);
            c.set(Calendar.MILLISECOND, 0);
            startMs = c.getTimeInMillis();
        }
        if (endMs <= startMs) endMs = System.currentTimeMillis();

        int w = 720;
        int h = 280;
        int padL = 44;
        int padR = 10;
        int padT = 8;
        int padB = 52;
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);
        canvas.drawColor(COLOR_PAPER);

        float[] mmol = new float[points.size()];
        for (int i = 0; i < points.size(); i++) mmol[i] = points.get(i).mmol;
        float[] domain = computeYDomain(mmol);
        float yMin = domain[0];
        float yMax = domain[1];

        Paint band = new Paint(Paint.ANTI_ALIAS_FLAG);
        band.setColor(COLOR_BAND);
        float bandTop = mapY(HIGH, h, padT, padB, yMin, yMax);
        float bandBot = mapY(LOW, h, padT, padB, yMin, yMax);
        canvas.drawRect(padL, Math.min(bandTop, bandBot), w - padR, Math.max(bandTop, bandBot), band);

        Paint guide = new Paint(Paint.ANTI_ALIAS_FLAG);
        guide.setColor(COLOR_LINE);
        guide.setStrokeWidth(2f);
        canvas.drawLine(padL, bandTop, w - padR, bandTop, guide);
        canvas.drawLine(padL, bandBot, w - padR, bandBot, guide);

        Paint labelPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        labelPaint.setColor(COLOR_MUTED);
        labelPaint.setTextSize(18f);
        labelPaint.setTextAlign(Paint.Align.RIGHT);
        canvas.drawText(fmtTick(LOW), padL - 6, bandBot + 6, labelPaint);
        canvas.drawText(fmtTick(HIGH), padL - 6, bandTop + 6, labelPaint);
        if (Math.abs(yMax - HIGH) > 0.2f) {
            canvas.drawText(fmtTick(yMax), padL - 6, padT + 14, labelPaint);
        }
        if (Math.abs(yMin - LOW) > 0.2f) {
            canvas.drawText(fmtTick(yMin), padL - 6, h - padB, labelPaint);
        }

        float plotW = w - padL - padR;
        long span = Math.max(1L, endMs - startMs);

        Paint gapPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        gapPaint.setColor(COLOR_GAP);
        gapPaint.setAlpha(90);
        for (int i = 1; i < points.size(); i++) {
            long dt = points.get(i).t - points.get(i - 1).t;
            if (dt <= GAP_MS) continue;
            float x0 = padL + (points.get(i - 1).t - startMs) / (float) span * plotW;
            float x1 = padL + (points.get(i).t - startMs) / (float) span * plotW;
            canvas.drawRect(x0, padT, x1, h - padB, gapPaint);
        }

        if (points.size() >= 2) {
            Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
            line.setStyle(Paint.Style.STROKE);
            line.setStrokeWidth(4.5f);
            line.setColor(COLOR_INK);
            line.setStrokeCap(Paint.Cap.ROUND);
            line.setStrokeJoin(Paint.Join.ROUND);

            Path path = new Path();
            boolean started = false;
            for (int i = 0; i < points.size(); i++) {
                if (i > 0 && points.get(i).t - points.get(i - 1).t > GAP_MS) {
                    started = false;
                }
                float x = padL + (points.get(i).t - startMs) / (float) span * plotW;
                float y = mapY(points.get(i).mmol, h, padT, padB, yMin, yMax);
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
                float v = points.get(i).mmol;
                if (v >= LOW && v <= HIGH) continue;
                float x = padL + (points.get(i).t - startMs) / (float) span * plotW;
                float y = mapY(v, h, padT, padB, yMin, yMax);
                if (v < VERY_LOW) pt.setColor(COLOR_VERY_LOW);
                else if (v < LOW) pt.setColor(COLOR_LOW);
                else pt.setColor(COLOR_HIGH);
                canvas.drawCircle(x, y, 4.5f, pt);
            }

            Pt last = points.get(points.size() - 1);
            float lastX = padL + (last.t - startMs) / (float) span * plotW;
            float lastY = mapY(last.mmol, h, padT, padB, yMin, yMax);
            Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
            ring.setColor(0xFFFFFFFF);
            canvas.drawCircle(lastX, lastY, 8f, ring);
            Paint lastP = new Paint(Paint.ANTI_ALIAS_FLAG);
            lastP.setColor(COLOR_TEAL);
            canvas.drawCircle(lastX, lastY, 5.5f, lastP);
        }

        Paint xPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        xPaint.setColor(COLOR_MUTED);
        xPaint.setTextSize(18f);
        xPaint.setTextAlign(Paint.Align.CENTER);
        Calendar tick = Calendar.getInstance();
        tick.setTimeInMillis(startMs);
        tick.set(Calendar.MINUTE, 0);
        tick.set(Calendar.SECOND, 0);
        tick.set(Calendar.MILLISECOND, 0);
        int hour = tick.get(Calendar.HOUR_OF_DAY);
        int step = 6;
        hour = (hour / step) * step;
        tick.set(Calendar.HOUR_OF_DAY, hour);
        while (tick.getTimeInMillis() <= endMs + 60_000L) {
            long t = tick.getTimeInMillis();
            if (t >= startMs) {
                float x = padL + (t - startMs) / (float) span * plotW;
                String hh = String.format(Locale.UK, "%02d", tick.get(Calendar.HOUR_OF_DAY));
                canvas.drawText(hh, x, h - padB + 20, xPaint);
            }
            tick.add(Calendar.HOUR_OF_DAY, step);
        }

        float barY = h - 22;
        float barH = 6f;
        Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
        track.setColor(COLOR_GAP);
        canvas.drawRoundRect(padL, barY, w - padR, barY + barH, 3f, 3f, track);
        if (points.size() >= 1) {
            Paint cov = new Paint(Paint.ANTI_ALIAS_FLAG);
            cov.setColor(COLOR_TEAL);
            for (int i = 0; i < points.size(); i++) {
                long a = i == 0 ? Math.max(startMs, points.get(0).t) : points.get(i).t;
                long b;
                if (i < points.size() - 1) {
                    long nxt = points.get(i + 1).t;
                    b = (nxt - points.get(i).t > GAP_MS) ? points.get(i).t : nxt;
                } else {
                    b = Math.min(endMs, points.get(i).t + GAP_MS);
                }
                if (b <= a) continue;
                float x0 = padL + (a - startMs) / (float) span * plotW;
                float x1 = padL + (b - startMs) / (float) span * plotW;
                canvas.drawRect(x0, barY, x1, barY + barH, cov);
            }
        }

        Paint meta = new Paint(Paint.ANTI_ALIAS_FLAG);
        meta.setColor(COLOR_MUTED);
        meta.setTextSize(18f);
        meta.setTextAlign(Paint.Align.LEFT);
        canvas.drawText("00:00–24:00", padL, h - 4, meta);
        meta.setTextAlign(Paint.Align.RIGHT);
        String covLabel = (coveragePct == null || coveragePct.isEmpty() || coveragePct.equals("--"))
            ? ""
            : coveragePct + "%";
        canvas.drawText(covLabel, w - padR, h - 4, meta);

        return bmp;
    }

    private static String fmtTick(float v) {
        if (Math.abs(v - Math.round(v)) < 0.05f) return String.valueOf(Math.round(v));
        return String.format(Locale.US, "%.1f", v);
    }

    private static float[] computeYDomain(float[] points) {
        if (points.length == 0) {
            return new float[] { 3.0f, 12.0f };
        }
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

    private static float mapY(float mmol, int h, int padT, int padB, float yMin, float yMax) {
        float usable = h - padT - padB;
        return (h - padB) - ((mmol - yMin) / (yMax - yMin)) * usable;
    }

    private static List<Pt> parseTimedPoints(String csv) {
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
            return out;
        }
        String[] parts = csv.split(",");
        long now = System.currentTimeMillis();
        long start = now - 3L * 60L * 60L * 1000L;
        int n = 0;
        for (String p : parts) {
            try {
                float v = Float.parseFloat(p.trim());
                if (v > 0) n++;
            } catch (Exception ignored) {
            }
        }
        int i = 0;
        for (String p : parts) {
            try {
                float v = Float.parseFloat(p.trim());
                if (v > 0) {
                    long t = n <= 1 ? now : start + (long) (i / (double) (n - 1) * (now - start));
                    out.add(new Pt(t, v));
                    i++;
                }
            } catch (Exception ignored) {
            }
        }
        return out;
    }
}
