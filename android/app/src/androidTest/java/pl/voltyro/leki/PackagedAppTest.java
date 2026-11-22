package pl.voltyro.leki;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.InputStream;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class PackagedAppTest {
    @Test
    public void launcherContainsTheOfflineApplication() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("pl.voltyro.leki", context.getPackageName());
        for (String path : new String[]{"public/index.html", "public/native-reminders.js", "public/data.js"}) {
            try (InputStream asset = context.getAssets().open(path)) {
                assertNotNull(asset);
            }
        }
    }
}
