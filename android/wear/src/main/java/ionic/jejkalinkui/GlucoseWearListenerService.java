package ionic.jejkalinkui;

import android.content.ComponentName;

import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester;

import com.google.android.gms.wearable.DataEventBuffer;
import com.google.android.gms.wearable.WearableListenerService;

/** Asks the complication to redraw when the phone publishes a new reading. */
public class GlucoseWearListenerService extends WearableListenerService {
    @Override
    public void onDataChanged(DataEventBuffer dataEvents) {
        dataEvents.release();
        ComplicationDataSourceUpdateRequester.create(
                this,
                new ComponentName(this, GlucoseComplicationService.class)
        ).requestUpdateAll();
    }
}
