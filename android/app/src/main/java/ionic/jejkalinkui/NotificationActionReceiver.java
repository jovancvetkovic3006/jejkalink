package ionic.jejkalinkui;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

public class NotificationActionReceiver extends BroadcastReceiver {

    public static final String ACTION_REFRESH = "ionic.jejkalinkui.ACTION_REFRESH";
    public static final String ACTION_OPEN = "ionic.jejkalinkui.ACTION_OPEN";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        Log.i("NotifAction", "Received action: " + action);

        if (ACTION_OPEN.equals(action)) {
            Intent launchIntent = context.getPackageManager()
                    .getLaunchIntentForPackage(context.getPackageName());
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                context.startActivity(launchIntent);
            }
        } else if (ACTION_REFRESH.equals(action)) {
            // Send broadcast that the background plugin can pick up
            Intent refreshIntent = new Intent("ionic.jejkalinkui.TRIGGER_REFRESH");
            refreshIntent.setPackage(context.getPackageName());
            context.sendBroadcast(refreshIntent);
        }
    }
}
