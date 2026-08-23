package ionic.jejkalinkui;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

public class GlucoseWidgetProvider extends AppWidgetProvider {

    public static final String ACTION_UPDATE_WIDGET = "ionic.jejkalinkui.UPDATE_GLUCOSE_WIDGET";
    private static final String PREFS_NAME = "glucose_widget_prefs";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_UPDATE_WIDGET.equals(intent.getAction())) {
            AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
            ComponentName widget = new ComponentName(context, GlucoseWidgetProvider.class);
            int[] appWidgetIds = appWidgetManager.getAppWidgetIds(widget);
            for (int appWidgetId : appWidgetIds) {
                updateWidget(context, appWidgetManager, appWidgetId);
            }
        }
    }

    private void updateWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String glucoseValue = prefs.getString("glucose_value", "--");
        String trendArrow = prefs.getString("trend_arrow", "");
        String timeSince = prefs.getString("time_since", "--");
        String status = prefs.getString("status", "");
        double sgValue = Double.parseDouble(prefs.getString("sg_double", "0"));

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_glucose);

        views.setTextViewText(R.id.widget_glucose_value, glucoseValue);
        views.setTextViewText(R.id.widget_trend_arrow, trendArrow);
        views.setTextViewText(R.id.widget_time_since, timeSince);
        views.setTextViewText(R.id.widget_status, status);

        // Color-coded background based on glucose level
        // mmol/L bands: low < 3.9, in-range 3.9–10.0, high > 10.0
        if (sgValue > 0 && sgValue < 3.9) {
            views.setInt(R.id.widget_root, "setBackgroundResource", R.drawable.widget_background_red);
        } else if (sgValue > 10.0) {
            views.setInt(R.id.widget_root, "setBackgroundResource", R.drawable.widget_background_orange);
        } else {
            views.setInt(R.id.widget_root, "setBackgroundResource", R.drawable.widget_background);
        }

        // Open app on tap
        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launchIntent != null) {
            PendingIntent pendingIntent = PendingIntent.getActivity(
                    context, 0, launchIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);
        }

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    /**
     * Static helper to save glucose data and trigger widget update.
     * Called from BackgroundPlugin after each data fetch.
     */
    public static void updateGlucoseData(Context context, String glucoseValue, String trendArrow,
            String timeSince, String status, double sgValue) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
                .putString("glucose_value", glucoseValue)
                .putString("trend_arrow", trendArrow)
                .putString("time_since", timeSince)
                .putString("status", status)
                .putString("sg_double", String.valueOf(sgValue))
                .apply();

        // Broadcast to update all widget instances
        Intent intent = new Intent(ACTION_UPDATE_WIDGET);
        intent.setComponent(new ComponentName(context, GlucoseWidgetProvider.class));
        context.sendBroadcast(intent);
    }
}
