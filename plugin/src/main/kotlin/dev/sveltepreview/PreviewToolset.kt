package dev.sveltepreview

import com.google.gson.JsonObject
import com.intellij.mcpserver.McpToolCallResult
import com.intellij.mcpserver.McpToolset
import com.intellij.mcpserver.annotations.McpDescription
import com.intellij.mcpserver.annotations.McpTool
import com.intellij.mcpserver.annotations.McpToolHintValue
import com.intellij.mcpserver.annotations.McpToolHints
import com.intellij.mcpserver.project
import com.intellij.openapi.application.EDT
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.future.await
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject

class PreviewToolset : McpToolset {
    override fun displayName() = "Svelte Preview"

    @McpTool
    @McpToolHints(readOnlyHint = McpToolHintValue.TRUE)
    @McpDescription(
        "Discover and inspect the active Svelte Preview in IntelliJ. Omit state to list names, URLs, viewports, and render " +
            "statuses. Pass an exact state name to read its rendered text or error from the existing browser frame. " +
            "Set include_guide for instructions on defining previews, mocks, configuration, and browser access. " +
            "The guide is available even when the preview panel is closed."
    )
    suspend fun svelte_preview_inspect(
        @McpDescription("Exact name of the state to inspect. Omit to discover available states.")
        state: String? = null,
        @McpDescription("Include setup and browser instructions. Defaults to false.")
        include_guide: Boolean = false
    ): McpToolCallResult {
        // Read the project's existing panel on the UI thread and await the result off that thread.
        val project = currentCoroutineContext().project
        val request = withContext(Dispatchers.EDT) {
            PreviewToolWindowFactory.existingPanel(project)?.inspectPreview(state)
        }
        val preview = request?.await() ?: PreviewInspection.withStatus(JsonObject(), "inactive")

        // Give the caller a next step for each status, including when no browser can be inspected.
        val status = preview.get("status").asString
        val guidance = when {
            preview.get("unknownState")?.asBoolean == true -> "Choose an exact name from states and call again."
            status == "ready" && state == null -> "Pass an exact state name to read its rendered text."
            status == "ready" -> "A mounted state can still be waiting for application data. Check its rendered text and call again if needed."
            status == "inactive" -> "Open a .svelte component and show View → Tool Windows → Svelte Preview."
            status == "starting" || status == "loading" -> "Call again after the preview has loaded."
            status == "missing" -> "Use Create preview in the panel or add a neighboring .preview.ts or .preview.js definition."
            status == "paused" -> "Choose Resume preview in the panel to load the latest changes."
            status == "error" -> "Read the error in the result or the Svelte Preview panel."
            status == "unsupported" -> "Update the project's svelte-preview runtime to a version with browser harness support."
            preview.has("galleryUrl") -> "Open galleryUrl in a browser on the IDE host to inspect the preview."
            else -> "Check the Svelte Preview panel for runtime startup errors."
        }
        preview.addProperty("guidance", guidance)
        if (include_guide) preview.addProperty("guide", usageGuide)
        val text = preview.toString()
        return McpToolCallResult.text(text, Json.parseToJsonElement(text).jsonObject)
    }

    private companion object {
        val usageGuide = """
            Install svelte-preview as a dev dependency in the Svelte package. Put Component.preview.ts or Component.preview.js next to Component.svelte.
            Import { definePreviews } from 'svelte-preview' and default-export definePreviews(Component, { Default: { props: {} } }).
            Supply the component's real props. Add named fixtures for the states you want to inspect.

            Set a state's viewport to 'auto' or { width, height } in CSS pixels. Use a synchronous setup({ http }) hook for fetch mocks.
            Match the request method and pathname. Use { pending: true } to leave a mocked request pending.
            Use svelte-preview.config.ts, .js, or .mjs next to package.json for shared CSS, aliases, theme, setup, and SvelteKit page fixtures.

            In IntelliJ, open the component and show View → Tool Windows → Svelte Preview. Save to refresh.
            Call svelte_preview_inspect without state to discover the gallery and states, then pass an exact name to read its live rendered text.

            For standalone inspection, run pnpm exec svelte-preview --root . --port 0 in the Svelte package.
            Read the URL from the SVELTE_PREVIEW_READY stdout line and open /?file=<component> or /__preview/frame?file=<component>&state=<name>.
            Encode the package-relative component and state with URLSearchParams. On the gallery, wait for html[data-preview-status="ready"].
            Use iframe[data-preview-state] to read state names, src, and JSON data-preview-viewport. Apply fixed dimensions to the browser viewport.
            In a state document wait for html[data-preview-status="mounted"], then wait for the specific UI. Read [data-preview-error] on error.
        """.trimIndent()
    }
}
