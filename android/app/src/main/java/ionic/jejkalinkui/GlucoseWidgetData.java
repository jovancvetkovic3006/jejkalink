package ionic.jejkalinkui;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

/** Shared prefs + broadcast for all glucose home-screen widgets. */
public final class GlucoseWidgetData {
    public static final String ACTION_UPDATE = "ionic.jejkalinkui.UPDATE_GLUCOSE_WIDGET";
    public static final String PREFS = "glucose_widget_prefs";

    private GlucoseWidgetData() {}

    public static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static String formatAge(SharedPreferences prefs) {
        long lastGoodMs = prefs.getLong("last_good_reading_ms", 0);
        if (lastGoodMs > 0) {
            int minutes = (int) Math.max(0L, (System.currentTimeMillis() - lastGoodMs) / 60000L);
            if (minutes == 0) return "just now";
            int h = minutes / 60;
            int rem = minutes % 60;
            return String.format(java.util.Locale.US, "%02d:%02d ago", h, rem);
        }
        String timeSince = prefs.getString("time_since", "--");
        if (timeSince != null && timeSince.contains("-")) {
            return timeSince.replace("-", "");
        }
        return timeSince != null ? timeSince : "--";
    }

    public static int backgroundRes(double sgValue) {
        if (sgValue > 0 && sgValue < 3.9) return R.drawable.widget_background_red;
        if (sgValue > 10.0) return R.drawable.widget_background_orange;
        return R.drawable.widget_background;
    }

    public static void notifyAll(Context context) {
        String[] providers = {
            "ionic.jejkalinkui.GlucoseWidgetProvider",
            "ionic.jejkalinkui.GlucoseWidgetCompactProvider",
            "ionic.jejkalinkui.GlucoseWidgetChartProvider",
        };
        for (String name : providers) {
            Intent intent = new Intent(ACTION_UPDATE);
            intent.setComponent(new ComponentName(context, name));
            context.sendBroadcast(intent);
        }
    }
}
