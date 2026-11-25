package dev.sveltepreview;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParseException;
import com.google.gson.JsonParser;
import com.google.gson.JsonPrimitive;
import org.cef.browser.CefBrowser;

import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

final class PreviewInspection {
    private static final Gson JSON = new Gson();
    private static final String SNAPSHOT = """
        ((galleryUrl, requestedState) => {
            // The panel can still be navigating to the selected component.
            if (location.href !== galleryUrl) return { status: 'loading' };
            const status = document.documentElement.dataset.previewStatus
                ?? (document.readyState === 'complete' ? 'unsupported' : 'loading');
            const error = document.querySelector('[data-preview-error]')?.innerText;

            // Inspect the existing iframes so snapshots include changes made in the IDE.
            const states = Array.from(document.querySelectorAll('#app iframe[data-preview-state]'), frame => {
                const name = frame.dataset.previewState;
                const page = frame.contentDocument;
                const state = { name, url: frame.src, viewport: JSON.parse(frame.dataset.previewViewport) };
                state.status = page?.URL === 'about:blank' ? 'loading'
                    : page?.URL === state.url ? page.documentElement.dataset.previewStatus ?? 'loading'
                    : 'unavailable';

                // Include rendered text only for the requested state.
                if (name === requestedState && state.status === 'mounted') {
                    const text = page.body.innerText;
                    state.text = text.slice(0, 12000);
                    state.truncated = text.length > 12000;
                }
                if (name === requestedState && state.status === 'error') {
                    state.error = page.querySelector('[data-preview-error]')?.innerText.slice(0, 2000);
                }
                return state;
            });
            const unknownState = status === 'ready' && requestedState !== null
                && !states.some(state => state.name === requestedState);
            return { status, error: error?.slice(0, 2000), states, unknownState };
        })(%s, %s)
        """;

    private PreviewInspection() {}

    static CompletableFuture<JsonObject> read(CefBrowser browser, JsonObject preview, String state) {
        // Use the browser's own DevTools client so the IDE needs no remote debugging listener.
        var client = browser.getDevToolsClient();
        if (client == null) return CompletableFuture.completedFuture(withStatus(preview, "unavailable"));
        var params = new JsonObject();
        params.addProperty("expression", SNAPSHOT.formatted(JSON.toJson(preview.get("galleryUrl")), JSON.toJson(state)));
        params.addProperty("returnByValue", true);

        // Keep a failed or timed-out inspection useful by returning the gallery URL as a fallback.
        return client.executeDevToolsMethod("Runtime.evaluate", params.toString())
            .orTimeout(3, TimeUnit.SECONDS)
            .handle((result, error) -> error == null ? withSnapshot(preview, result) : withStatus(preview, "unavailable"));
    }

    static JsonObject withSnapshot(JsonObject preview, String response) {
        // A missing or malformed reply leaves the gallery URL available to the harness.
        if (response == null) return withStatus(preview, "unavailable");
        try {
            var envelope = JsonParser.parseString(response);
            if (!(envelope instanceof JsonObject message) || !(message.get("result") instanceof JsonObject result)
                || !(result.get("value") instanceof JsonObject snapshot)
                || !(snapshot.get("status") instanceof JsonPrimitive status) || !status.isString()) {
                return withStatus(preview, "unavailable");
            }

            // Merge browser observations without allowing them to replace IDE metadata.
            for (var field : List.of("status", "states", "error", "unknownState")) {
                if (snapshot.has(field)) preview.add(field, snapshot.get(field));
            }
            return preview;
        } catch (JsonParseException error) {
            return withStatus(preview, "unavailable");
        }
    }

    static JsonObject withStatus(JsonObject preview, String status) {
        preview.addProperty("status", status);
        return preview;
    }
}
