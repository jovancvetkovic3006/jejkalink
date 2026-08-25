package ionic.jejkalinkui;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

/** Compact 1×1 — value only, range-colored. */
public class GlucoseWidgetCompactProvider extends AppWidgetProvider {

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
            ComponentName widget = new ComponentName(context, GlucoseWidgetCompactProvider.class);
            for (int id : mgr.getAppWidgetIds(widget)) {
                update(context, mgr, id);
            }
        }
    }

    private void update(Context context, AppWidgetManager mgr, int appWidgetId) {
        SharedPreferences prefs = GlucoseWidgetData.prefs(context);
        String glucoseValue = prefs.getString("glucose_value", "--");
        double sgValue = 0;
        try {
            sgValue = Double.parseDouble(prefs.getString("sg_double", "0"));
        } catch (Exception ignored) {
        }

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_glucose_compact);
        views.setTextViewText(R.id.widget_glucose_value, glucoseValue);
        views.setInt(R.id.widget_root, "setBackgroundResource", GlucoseWidgetData.backgroundRes(sgValue));

        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launch != null) {
            PendingIntent pi = PendingIntent.getActivity(
                context, 1, launch,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_root, pi);
        }
        mgr.updateAppWidget(appWidgetId, views);
    }
}
