package ionic.jejkalinkui;

import com.getcapacitor.BridgeActivity;
import android.webkit.WebView; 
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView.setWebContentsDebuggingEnabled(true);
    }
}
