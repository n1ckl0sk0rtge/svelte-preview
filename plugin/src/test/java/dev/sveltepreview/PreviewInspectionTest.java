package dev.sveltepreview;

import com.google.gson.JsonObject;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

public class PreviewInspectionTest {
    @Test
    public void returnsBrowserStateAlongsideIdeMetadata() {
        // Model a Runtime.evaluate reply with a mounted state and rendered text.
        var preview = new JsonObject();
        preview.addProperty("galleryUrl", "http://127.0.0.1:4317/?file=Card.svelte");
        var response = """
            {
                "result": { "value": {
                    "status": "ready",
                    "galleryUrl": "another page",
                    "states": [{ "name": "Loaded", "status": "mounted", "text": "1 added to bag" }]
                } }
            }
            """;

        // Browser data can supply render observations while the IDE owns the link.
        var inspected = PreviewInspection.withSnapshot(preview, response);
        assertEquals("http://127.0.0.1:4317/?file=Card.svelte", inspected.get("galleryUrl").getAsString());
        assertEquals("ready", inspected.get("status").getAsString());
        assertEquals("1 added to bag", inspected.getAsJsonArray("states").get(0).getAsJsonObject().get("text").getAsString());
    }

    @Test
    public void leavesGalleryUrlAvailableWhenBrowserInspectionFails() {
        // DevTools can return an exception instead of a by-value snapshot.
        var preview = new JsonObject();
        preview.addProperty("galleryUrl", "http://127.0.0.1:4317/?file=Card.svelte");
        var inspected = PreviewInspection.withSnapshot(preview, """
            { "result": { "type": "object", "subtype": "error" }, "exceptionDetails": {} }
            """);

        // A harness can still open the gallery in another browser.
        assertEquals("unavailable", inspected.get("status").getAsString());
        assertEquals("http://127.0.0.1:4317/?file=Card.svelte", inspected.get("galleryUrl").getAsString());
        assertFalse(inspected.has("states"));
    }
}
