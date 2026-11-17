package dev.sveltepreview;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.Assert.*;

public class PreviewPathsTest {
    @Rule public TemporaryFolder temporary = new TemporaryFolder();

    @Test
    public void findsClosestPackageAndHoistedRuntime() throws Exception {
        // Simulate a monorepo package with a runtime installed at the workspace root.
        Path workspace = temporary.getRoot().toPath();
        Files.writeString(workspace.resolve("package.json"), "{}");
        Path app = Files.createDirectories(workspace.resolve("packages/app"));
        Files.writeString(app.resolve("package.json"), "{}");
        Path component = Files.createDirectories(app.resolve("src/lib")).resolve("Card.svelte");
        Files.writeString(component, "");
        Path runtime = Files.createDirectories(workspace.resolve("node_modules/svelte-preview/bin")).resolve("svelte-preview.mjs");
        Files.writeString(runtime, "");

        // Root selection and dependency resolution must agree for nested projects.
        assertEquals(app, PreviewPaths.projectRoot(component));
        assertEquals(runtime, PreviewPaths.runtimeScript(app));
        assertEquals("http://127.0.0.1:1234/?file=src%2Flib%2FCard.svelte", PreviewPaths.previewUrl("http://127.0.0.1:1234/", app, component));
    }

    @Test
    public void previewSelectionMapsBackToComponent() throws Exception {
        Path directory = temporary.getRoot().toPath();
        Path component = directory.resolve("My Card.svelte");
        Files.writeString(component, "");
        assertEquals(component, PreviewPaths.componentFor(directory.resolve("My Card.preview.ts")));
        assertNull(PreviewPaths.componentFor(directory.resolve("fixtures.ts")));
        assertTrue(PreviewPaths.previewUrl("http://127.0.0.1/", directory, component).contains("My+Card.svelte"));
    }
}
