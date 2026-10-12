package ionic.jejkalinkui;

import android.net.Uri;
import android.os.RemoteException;

import androidx.annotation.NonNull;
import androidx.wear.watchface.complications.data.ComplicationData;
import androidx.wear.watchface.complications.data.ComplicationType;
import androidx.wear.watchface.complications.data.LongTextComplicationData;
import androidx.wear.watchface.complications.data.PlainComplicationText;
import androidx.wear.watchface.complications.data.RangedValueComplicationData;
import androidx.wear.watchface.complications.data.ShortTextComplicationData;
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceService;
import androidx.wear.watchface.complications.datasource.ComplicationRequest;

import com.google.android.gms.wearable.DataItemBuffer;
import com.google.android.gms.wearable.DataMap;
import com.google.android.gms.wearable.DataMapItem;
import com.google.android.gms.wearable.Wearable;

/**
 * Watch-face slot. Value is the latest mmol/L reading pushed by the phone app.
 */
public class GlucoseComplicationService extends ComplicationDataSourceService {
    static final String PATH = "/jejkalink/glucose";
    private static final float GAUGE_MIN = 2f;
    private static final float GAUGE_MAX = 16f;

    @Override
    public void onComplicationRequest(@NonNull ComplicationRequest request,
            @NonNull ComplicationRequestListener listener) {
        Uri uri = new Uri.Builder().scheme("wear").path(PATH).build();
        Wearable.getDataClient(this).getDataItems(uri)
                .addOnSuccessListener(items -> deliver(listener, request.getComplicationType(), read(items)))
                .addOnFailureListener(e -> deliver(listener, request.getComplicationType(), Reading.empty()));
    }

    private static void deliver(ComplicationRequestListener listener, ComplicationType type, Reading reading) {
        try {
            listener.onComplicationData(forType(type, reading));
        } catch (RemoteException ignored) {
        }
    }

    @Override
    public ComplicationData getPreviewData(@NonNull ComplicationType complicationType) {
        return forType(complicationType, new Reading("6.4", 6.4f, ""));
    }

    private static Reading read(DataItemBuffer items) {
        try {
            if (items.getCount() == 0) {
                return Reading.empty();
            }
            DataMap map = DataMapItem.fromDataItem(items.get(0)).getDataMap();
            String text = map.getString("text", "--");
            float mmol = map.getFloat("mmol", Float.NaN);
            String trend = map.getString("trend", "");
            if (text == null || text.isEmpty()) {
                text = "--";
            }
            return new Reading(text, mmol, trend == null ? "" : trend.trim());
        } finally {
            items.release();
        }
    }

    static ComplicationData forType(ComplicationType type, Reading reading) {
        PlainComplicationText description = text(contentDescription(reading));
        String shortValue = reading.hasValue() ? shortValue(reading) : "--";
        switch (type) {
            case SHORT_TEXT:
                return new ShortTextComplicationData.Builder(text(shortValue), description)
                        .setTitle(text("mmol/L"))
                        .build();
            case LONG_TEXT:
                String longText = reading.hasValue() ? longValue(reading) : "No glucose";
                return new LongTextComplicationData.Builder(text(longText), description)
                        .setTitle(text("mmol/L"))
                        .build();
            case RANGED_VALUE:
                float gauge = reading.hasValue() ? reading.mmol : GAUGE_MIN;
                if (gauge < GAUGE_MIN) {
                    gauge = GAUGE_MIN;
                } else if (gauge > GAUGE_MAX) {
                    gauge = GAUGE_MAX;
                }
                return new RangedValueComplicationData.Builder(gauge, GAUGE_MIN, GAUGE_MAX, description)
                        .setText(text(shortValue))
                        .setTitle(text("mmol/L"))
                        .build();
            default:
                return null;
        }
    }

    static String shortValue(Reading reading) {
        String combined = reading.trend.isEmpty() ? reading.text : reading.text + reading.trend;
        return combined.length() <= 7 ? combined : reading.text;
    }

    static String longValue(Reading reading) {
        if (reading.trend.isEmpty()) {
            return reading.text + " mmol/L";
        }
        return reading.text + " mmol/L " + reading.trend;
    }

    static String contentDescription(Reading reading) {
        if (!reading.hasValue()) {
            return "No glucose";
        }
        String spoken = reading.text + " millimoles per litre";
        if (!reading.trend.isEmpty()) {
            spoken = spoken + " " + reading.trend;
        }
        return spoken;
    }

    private static PlainComplicationText text(String value) {
        return new PlainComplicationText.Builder(value).build();
    }

    static final class Reading {
        final String text;
        final float mmol;
        final String trend;

        Reading(String text, float mmol, String trend) {
            this.text = text;
            this.mmol = mmol;
            this.trend = trend;
        }

        static Reading empty() {
            return new Reading("--", Float.NaN, "");
        }

        boolean hasValue() {
            return text != null && !text.isEmpty() && !"--".equals(text) && !Float.isNaN(mmol) && mmol > 0f;
        }
    }
}
