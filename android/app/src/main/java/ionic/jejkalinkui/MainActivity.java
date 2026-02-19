package ionic.jejkalinkui;

import com.getcapacitor.BridgeActivity;
import android.content.pm.ActivityInfo;
import android.webkit.WebView;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    private static MainActivity instance;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        instance = this;
        WebView.setWebContentsDebuggingEnabled(true);
    }

    public static MainActivity getInstance() {
        return instance;
    }

    public void unlockOrientation() {
        runOnUiThread(() -> setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED));
    }

    public void lockPortrait() {
        runOnUiThread(() -> setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT));
    }
}
