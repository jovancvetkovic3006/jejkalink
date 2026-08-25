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

    /** Fixed pixel size — avoid density-blown bitmaps that break binder / launcher. */
    private static Bitmap drawSparkline(String csv) {
        float[] points = parsePoints(csv);
        int w = 320;
        int h = 72;
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);

        Paint band = new Paint(Paint.ANTI_ALIAS_FLAG);
        band.setColor(0x33FFFFFF);
        float yLow = mapY(3.9f, h);
        float yHigh = mapY(10.0f, h);
        canvas.drawRect(0, Math.min(yLow, yHigh), w, Math.max(yLow, yHigh), band);

        if (points.length < 2) {
            Paint muted = new Paint(Paint.ANTI_ALIAS_FLAG);
            muted.setColor(0x66FFFFFF);
            muted.setStrokeWidth(3f);
            canvas.drawLine(0, h / 2f, w, h / 2f, muted);
            return bmp;
        }

        float min = points[0];
        float max = points[0];
        for (float p : points) {
            if (p < min) min = p;
            if (p > max) max = p;
        }
        min = Math.min(min, 3.5f);
        max = Math.max(max, 10.5f);
        if (max - min < 1.5f) {
            float mid = (min + max) / 2f;
            min = mid - 0.75f;
            max = mid + 0.75f;
        }

        Path path = new Path();
        for (int i = 0; i < points.length; i++) {
            float x = points.length == 1 ? w / 2f : (i / (float) (points.length - 1)) * (w - 2);
            float y = h - ((points[i] - min) / (max - min)) * (h - 4) - 2;
            if (i == 0) path.moveTo(x, y);
            else path.lineTo(x, y);
        }

        Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
        line.setStyle(Paint.Style.STROKE);
        line.setStrokeWidth(3f);
        line.setColor(0xFFFFFFFF);
        line.setStrokeCap(Paint.Cap.ROUND);
        line.setStrokeJoin(Paint.Join.ROUND);
        canvas.drawPath(path, line);

        float lastX = w - 2;
        float lastY = h - ((points[points.length - 1] - min) / (max - min)) * (h - 4) - 2;
        Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
        dot.setColor(0xFFFFFFFF);
        canvas.drawCircle(lastX, lastY, 4f, dot);

        return bmp;
    }

    private static float mapY(float mmol, int h) {
        float min = 3f;
        float max = 15f;
        return h - ((mmol - min) / (max - min)) * h;
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
