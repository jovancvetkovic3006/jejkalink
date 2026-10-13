package ionic.jejkalinkui;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.TextView;

/** Shown in the watch app list. The glucose value itself lives on the watch face. */
public class WatchHomeActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        float density = getResources().getDisplayMetrics().density;
        int pad = Math.round(28 * density);
        TextView text = new TextView(this);
        text.setText("Jejka eLink\n\nLong-press the watch face, tap Customize, choose a slot, and pick Jejka eLink.");
        text.setTextColor(Color.WHITE);
        text.setGravity(Gravity.CENTER);
        text.setTextSize(16);
        text.setPadding(pad, pad, pad, pad);
        setContentView(text);
    }
}
