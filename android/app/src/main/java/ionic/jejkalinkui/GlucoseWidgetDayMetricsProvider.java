package ionic.jejkalinkui;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;
import android.view.View;
import android.widget.RemoteViews;

/**
 * 4×2 — Day page second tile: in range, mean, below 3.9, above 10.0.
 */
public class GlucoseWidgetDayMetricsProvider extends AppWidgetProvider {
    private static final String TAG = "GlucoseWidgetDayMetrics";

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
            ComponentName widget = new ComponentName(context, GlucoseWidgetDayMetricsProvider.class);
            for (int id : mgr.getAppWidgetIds(widget)) {
                update(context, mgr, id);
            }
        }
    }

    private void update(Context context, AppWidgetManager mgr, int appWidgetId) {
        try {
            SharedPreferences prefs = GlucoseWidgetData.prefs(context);
            String points = prefs.getString("sparkline_points", "");
            boolean empty = points == null || points.isEmpty();

            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_day_metrics);
            bindPct(views, R.id.widget_tir_value, R.id.widget_tir_suffix, empty ? null : prefs.getString("day_tir", null));
            views.setTextViewText(R.id.widget_tir_delta, "3.9–10.0");

            String mean = empty ? null : prefs.getString("day_mean", null);
            views.setTextViewText(R.id.widget_mean_value, dash(mean));

            bindPct(views, R.id.widget_below_value, R.id.widget_below_suffix, empty ? null : prefs.getString("day_below", null));
            views.setTextViewText(
                R.id.widget_below_delta,
                empty ? "under 3.0" : dash(prefs.getString("day_very_low", null)) + "% under 3.0"
            );

            bindPct(views, R.id.widget_above_value, R.id.widget_above_suffix, empty ? null : prefs.getString("day_above", null));
            views.setTextViewText(
                R.id.widget_above_delta,
                empty ? "over 13.9" : dash(prefs.getString("day_very_high", null)) + "% over 13.9"
            );

            Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            if (launch != null) {
                PendingIntent pi = PendingIntent.getActivity(
                    context, 3, launch,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                views.setOnClickPendingIntent(R.id.widget_root, pi);
            }
            mgr.updateAppWidget(appWidgetId, views);
        } catch (Exception e) {
            Log.e(TAG, "update failed", e);
        }
    }

    private static void bindPct(RemoteViews views, int valueId, int suffixId, String pct) {
        boolean ok = pct != null && !pct.isEmpty();
        views.setTextViewText(valueId, ok ? pct : "--");
        views.setViewVisibility(suffixId, ok ? View.VISIBLE : View.GONE);
    }

    private static String dash(String s) {
        return (s == null || s.isEmpty()) ? "--" : s;
    }
}
