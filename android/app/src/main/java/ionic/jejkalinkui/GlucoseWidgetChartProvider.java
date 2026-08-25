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
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Shader;
import android.util.Log;
import android.widget.RemoteViews;

/** Wide 4×2 — value, trend, and last-3h sparkline. */
public class GlucoseWidgetChartProvider extends AppWidgetProvider {
    private static final String TAG = "GlucoseWidgetChart";

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
            views.setInt(R.id.widget_root, "setBackgroundResource", GlucoseWidgetData.backgroundRes(sgValue));

            try {
                Bitmap spark = drawSparkline(prefs.getString("sparkline_points", ""));
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

    /** High-res modern sparkline (sharp when scaled into the widget). */
    private static Bitmap drawSparkline(String csv) {
        float[] points = parsePoints(csv);
        // Render dense enough for xxxhdpi home screens without binder blowups
        int w = 720;
        int h = 200;
        int padX = 8;
        int padY = 14;
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);

        float yMin;
        float yMax;
        if (points.length >= 1) {
            float dMin = points[0];
            float dMax = points[0];
            for (float p : points) {
                if (p < dMin) dMin = p;
                if (p > dMax) dMax = p;
            }
            yMin = Math.min(dMin - 0.6f, 3.4f);
            yMax = Math.max(dMax + 0.6f, 10.2f);
            if (yMax - yMin < 5f) {
                float mid = (yMin + yMax) / 2f;
                yMin = mid - 2.5f;
                yMax = mid + 2.5f;
            }
            yMin = Math.max(2.0f, yMin);
            yMax = Math.min(20f, yMax);
        } else {
            yMin = 3.0f;
            yMax = 12.0f;
        }

        // Target band
        Paint band = new Paint(Paint.ANTI_ALIAS_FLAG);
        band.setColor(0x28FFFFFF);
        float bandTop = mapY(10.0f, h, padY, yMin, yMax);
        float bandBot = mapY(3.9f, h, padY, yMin, yMax);
        canvas.drawRect(padX, Math.min(bandTop, bandBot), w - padX, Math.max(bandTop, bandBot), band);

        // Guide lines
        Paint guide = new Paint(Paint.ANTI_ALIAS_FLAG);
        guide.setColor(0x40FFFFFF);
        guide.setStrokeWidth(1.5f);
        canvas.drawLine(padX, bandTop, w - padX, bandTop, guide);
        canvas.drawLine(padX, bandBot, w - padX, bandBot, guide);

        if (points.length < 2) {
            Paint muted = new Paint(Paint.ANTI_ALIAS_FLAG);
            muted.setColor(0x66FFFFFF);
            muted.setStrokeWidth(3f);
            canvas.drawLine(padX, h / 2f, w - padX, h / 2f, muted);
            return bmp;
        }

        Path linePath = new Path();
        Path fillPath = new Path();
        float plotW = w - 2f * padX;
        for (int i = 0; i < points.length; i++) {
            float x = padX + (points.length == 1 ? plotW / 2f
                : (i / (float) (points.length - 1)) * plotW);
            float y = mapY(points[i], h, padY, yMin, yMax);
            if (i == 0) {
                linePath.moveTo(x, y);
                fillPath.moveTo(x, h - padY);
                fillPath.lineTo(x, y);
            } else {
                linePath.lineTo(x, y);
                fillPath.lineTo(x, y);
            }
        }
        float lastX = padX + plotW;
        float lastY = mapY(points[points.length - 1], h, padY, yMin, yMax);
        fillPath.lineTo(lastX, h - padY);
        fillPath.close();

        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setStyle(Paint.Style.FILL);
        fill.setShader(new LinearGradient(
            0, padY, 0, h - padY,
            0x55FFFFFF, 0x00FFFFFF,
            Shader.TileMode.CLAMP));
        canvas.drawPath(fillPath, fill);

        Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
        line.setStyle(Paint.Style.STROKE);
        line.setStrokeWidth(5f);
        line.setColor(0xFFFFFFFF);
        line.setStrokeCap(Paint.Cap.ROUND);
        line.setStrokeJoin(Paint.Join.ROUND);
        canvas.drawPath(linePath, line);

        // Current reading dot + soft halo
        Paint halo = new Paint(Paint.ANTI_ALIAS_FLAG);
        halo.setColor(0x55FFFFFF);
        canvas.drawCircle(lastX, lastY, 10f, halo);
        Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
        dot.setColor(0xFFFFFFFF);
        canvas.drawCircle(lastX, lastY, 6f, dot);

        return bmp;
    }

    private static float mapY(float mmol, int h, int padY, float yMin, float yMax) {
        float usable = h - 2f * padY;
        return (h - padY) - ((mmol - yMin) / (yMax - yMin)) * usable;
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
