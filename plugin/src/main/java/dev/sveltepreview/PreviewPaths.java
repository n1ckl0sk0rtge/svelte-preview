package dev.sveltepreview;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

final class PreviewPaths {
    private PreviewPaths() {}

    static Path projectRoot(Path component) {
        // Use the component's closest package, including nested packages in a monorepo.
        for (Path directory = component.getParent(); directory != null; directory = directory.getParent()) {
            if (Files.isRegularFile(directory.resolve("package.json"))) return directory;
        }
        throw new IllegalArgumentException("No package.json found above this component.");
    }

    static Path runtimeScript(Path root) {
        // Package managers may hoist the runtime to an ancestor workspace node_modules directory.
        for (Path directory = root; directory != null; directory = directory.getParent()) {
            Path candidate = directory.resolve("node_modules/svelte-preview/bin/svelte-preview.mjs");
            if (Files.isRegularFile(candidate)) return candidate;
        }
        throw new IllegalArgumentException("Install the runtime in this package: pnpm add -D svelte-preview");
    }

    static String previewUrl(String baseUrl, Path root, Path component) {
        String relative = root.relativize(component).toString().replace('\\', '/');
        return baseUrl + "?file=" + URLEncoder.encode(relative, StandardCharsets.UTF_8);
    }

    static Path componentFor(Path selected) {
        // Keep following the same component while editing its preview definition.
        String name = selected.getFileName().toString();
        if (name.endsWith(".svelte")) return selected;
        for (String extension : new String[]{".preview.ts", ".preview.js"}) {
            if (name.endsWith(extension)) {
                Path component = selected.resolveSibling(name.substring(0, name.length() - extension.length()) + ".svelte");
                return Files.isRegularFile(component) ? component : null;
            }
        }
        return null;
    }
}
