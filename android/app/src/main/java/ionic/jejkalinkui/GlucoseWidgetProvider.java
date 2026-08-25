package ionic.jejkalinkui;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

/** Wide strip — glucose, trend, and time since last reading. */
public class GlucoseWidgetProvider extends AppWidgetProvider {

    public static final String ACTION_UPDATE_WIDGET = GlucoseWidgetData.ACTION_UPDATE;
    private static final String PREFS_NAME = GlucoseWidgetData.PREFS;

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (GlucoseWidgetData.ACTION_UPDATE.equals(intent.getAction())) {
            AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
            ComponentName widget = new ComponentName(context, GlucoseWidgetProvider.class);
            int[] appWidgetIds = appWidgetManager.getAppWidgetIds(widget);
            for (int appWidgetId : appWidgetIds) {
                updateWidget(context, appWidgetManager, appWidgetId);
            }
        }
    }

    private void updateWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        SharedPreferences prefs = GlucoseWidgetData.prefs(context);
        String glucoseValue = prefs.getString("glucose_value", "--");
        String trendArrow = prefs.getString("trend_arrow", "");
        String timeSince = GlucoseWidgetData.formatAge(prefs);
        String status = prefs.getString("status", "");
        double sgValue = 0;
        try {
            sgValue = Double.parseDouble(prefs.getString("sg_double", "0"));
        } catch (Exception ignored) {
        }

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_glucose);

        views.setTextViewText(R.id.widget_glucose_value, glucoseValue);
        views.setTextViewText(R.id.widget_trend_arrow, trendArrow);
        views.setTextViewText(R.id.widget_time_since, timeSince);
        views.setTextViewText(R.id.widget_status, status);
        views.setInt(R.id.widget_root, "setBackgroundResource", GlucoseWidgetData.backgroundRes(sgValue));

        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launchIntent != null) {
            PendingIntent pendingIntent = PendingIntent.getActivity(
                    context, 0, launchIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);
        }

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    /** Persist glucose fields and refresh every widget size. */
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
        GlucoseWidgetData.notifyAll(context);
    }
}
