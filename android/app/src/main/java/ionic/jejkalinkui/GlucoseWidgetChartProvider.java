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

/**
 * 4×2 — value/trend/age + sparkline styled like the in-app glucose chart
 * (white surface, teal target band, ink line, adaptive Y).
 */
public class GlucoseWidgetChartProvider extends AppWidgetProvider {
    private static final String TAG = "GlucoseWidgetChart";

    // Design tokens (match src/theme/tokens.css)
    private static final int COLOR_PAPER = 0xFFF6F7F9;
    private static final int COLOR_INK = 0xFF15213B;
    private static final int COLOR_BAND = 0xD9E9F5F3; // ~85% #E9F5F3
    private static final int COLOR_LINE = 0xFFE3E7ED;
    private static final int COLOR_MUTED = 0xFF707C91;
    private static final int COLOR_TEAL = 0xFF0E9B8A;
    private static final int COLOR_LOW = 0xFFC2255C;
    private static final int COLOR_VERY_LOW = 0xFF9B1B47;
    private static final int COLOR_HIGH = 0xFFC77C1E;
    private static final float LOW = 3.9f;
    private static final float HIGH = 10.0f;
    private static final float VERY_LOW = 3.0f;

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
            String glucoseValue = prefs.getString("glucose_value", "--");
            String trendArrow = prefs.getString("trend_arrow", "");
            String timeSince = GlucoseWidgetData.formatAge(prefs);
            double sgValue = 0;
            try {
                sgValue = Double.parseDouble(prefs.getString("sg_double", "0"));
            } catch (Exception ignored) {
            }

            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_glucose_chart);
            views.setTextViewText(R.id.widget_glucose_value, glucoseValue);
            views.setTextViewText(R.id.widget_trend_arrow, trendArrow);
            views.setTextViewText(R.id.widget_time_since, timeSince);
            views.setTextColor(R.id.widget_glucose_value, valueColor(sgValue));
            views.setTextColor(R.id.widget_trend_arrow, valueColor(sgValue));

            try {
                Bitmap spark = drawAppStyleChart(prefs.getString("sparkline_points", ""));
                if (spark != null) {
                    views.setImageViewBitmap(R.id.widget_sparkline, spark);
                }
            } catch (Exception e) {
                Log.w(TAG, "sparkline draw failed", e);
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
                fallback.setTextViewText(R.id.widget_glucose_value, "--");
                fallback.setTextViewText(R.id.widget_trend_arrow, "");
                fallback.setTextViewText(R.id.widget_time_since, "");
                mgr.updateAppWidget(appWidgetId, fallback);
            } catch (Exception ignored) {
            }
        }
    }

    private static int valueColor(double sg) {
        if (sg <= 0) return COLOR_INK;
        if (sg < VERY_LOW) return COLOR_VERY_LOW;
        if (sg < LOW) return COLOR_LOW;
        if (sg > 13.9) return COLOR_HIGH;
        if (sg > HIGH) return COLOR_HIGH;
        return COLOR_TEAL;
    }

    /** Mirror in-app glucose-chart: adaptive Y, teal band, ink line, last-point highlight. */
    private static Bitmap drawAppStyleChart(String csv) {
        float[] points = parsePoints(csv);
        int w = 720;
        int h = 220;
        int padL = 8;
        int padR = 12;
        int padT = 10;
        int padB = 10;
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);
        canvas.drawColor(COLOR_PAPER);

        float[] domain = computeYDomain(points);
        float yMin = domain[0];
        float yMax = domain[1];

        // Target band 3.9–10.0
        Paint band = new Paint(Paint.ANTI_ALIAS_FLAG);
        band.setColor(COLOR_BAND);
        float bandTop = mapY(HIGH, h, padT, padB, yMin, yMax);
        float bandBot = mapY(LOW, h, padT, padB, yMin, yMax);
        canvas.drawRect(padL, Math.min(bandTop, bandBot), w - padR, Math.max(bandTop, bandBot), band);

        // Guide lines at low / high
        Paint guide = new Paint(Paint.ANTI_ALIAS_FLAG);
        guide.setColor(COLOR_LINE);
        guide.setStrokeWidth(2f);
        canvas.drawLine(padL, bandTop, w - padR, bandTop, guide);
        canvas.drawLine(padL, bandBot, w - padR, bandBot, guide);

        if (points.length < 2) {
            Paint muted = new Paint(Paint.ANTI_ALIAS_FLAG);
            muted.setColor(COLOR_MUTED);
            muted.setStrokeWidth(3f);
            muted.setAlpha(120);
            canvas.drawLine(padL, h / 2f, w - padR, h / 2f, muted);
            return bmp;
        }

        float plotW = w - padL - padR;
        Path linePath = new Path();
        for (int i = 0; i < points.length; i++) {
            float x = padL + (i / (float) (points.length - 1)) * plotW;
            float y = mapY(points[i], h, padT, padB, yMin, yMax);
            if (i == 0) linePath.moveTo(x, y);
            else linePath.lineTo(x, y);
        }

        Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
        line.setStyle(Paint.Style.STROKE);
        line.setStrokeWidth(4.5f);
        line.setColor(COLOR_INK);
        line.setStrokeCap(Paint.Cap.ROUND);
        line.setStrokeJoin(Paint.Join.ROUND);
        canvas.drawPath(linePath, line);

        // Out-of-range point markers (like the app)
        Paint pt = new Paint(Paint.ANTI_ALIAS_FLAG);
        for (int i = 0; i < points.length; i++) {
            float v = points[i];
            if (v >= LOW && v <= HIGH) continue;
            float x = padL + (i / (float) (points.length - 1)) * plotW;
            float y = mapY(v, h, padT, padB, yMin, yMax);
            if (v < VERY_LOW) pt.setColor(COLOR_VERY_LOW);
            else if (v < LOW) pt.setColor(COLOR_LOW);
            else pt.setColor(COLOR_HIGH);
            canvas.drawCircle(x, y, 4.5f, pt);
        }

        // Last reading — teal with white ring (app highlightLast)
        float lastX = padL + plotW;
        float lastY = mapY(points[points.length - 1], h, padT, padB, yMin, yMax);
        Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
        ring.setColor(0xFFFFFFFF);
        canvas.drawCircle(lastX, lastY, 8f, ring);
        Paint last = new Paint(Paint.ANTI_ALIAS_FLAG);
        last.setColor(COLOR_TEAL);
        canvas.drawCircle(lastX, lastY, 5.5f, last);

        return bmp;
    }

    /** Same idea as glucose-chart.component.ts computeYDomain. */
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

    private static float[] parsePoints(String csv) {
        if (csv == null || csv.isEmpty()) return new float[0];
        String[] parts = csv.split(",");
        float[] out = new float[parts.length];
        int n = 0;
        for (String p : parts) {
            try {
                float v = Float.parseFloat(p.trim());
                if (v > 0) out[n++] = v;
            } catch (Exception ignored) {
            }
        }
        if (n == out.length) return out;
        float[] trimmed = new float[n];
        System.arraycopy(out, 0, trimmed, 0, n);
        return trimmed;
    }
}
