package dev.sveltepreview;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.intellij.icons.AllIcons;
import com.intellij.execution.configurations.GeneralCommandLine;
import com.intellij.execution.process.OSProcessHandler;
import com.intellij.execution.process.ProcessAdapter;
import com.intellij.execution.process.ProcessEvent;
import com.intellij.execution.process.ProcessOutputTypes;
import com.intellij.ide.BrowserUtil;
import com.intellij.ide.ui.LafManagerListener;
import com.intellij.ide.util.PropertiesComponent;
import com.intellij.javascript.nodejs.interpreter.NodeJsInterpreterRef;
import com.intellij.openapi.Disposable;
import com.intellij.openapi.actionSystem.ActionUpdateThread;
import com.intellij.openapi.actionSystem.AnAction;
import com.intellij.openapi.actionSystem.AnActionEvent;
import com.intellij.openapi.actionSystem.DefaultActionGroup;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.command.WriteCommandAction;
import com.intellij.openapi.fileEditor.FileEditorManager;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.project.DumbAwareAction;
import com.intellij.openapi.util.Disposer;
import com.intellij.openapi.util.Key;
import com.intellij.openapi.ui.popup.JBPopupFactory;
import com.intellij.openapi.ui.popup.PopupShowOptions;
import com.intellij.openapi.vfs.LocalFileSystem;
import com.intellij.openapi.vfs.VfsUtil;
import com.intellij.ui.jcef.JBCefApp;
import com.intellij.ui.jcef.JBCefBrowser;
import com.intellij.ui.jcef.JBCefOSRHandlerFactory;
import com.intellij.ui.JBColor;
import com.intellij.ui.components.JBPanelWithEmptyText;
import org.jetbrains.annotations.NotNull;
import org.cef.handler.CefRenderHandler;

import javax.swing.*;
import java.awt.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BooleanSupplier;

final class PreviewPanel extends JPanel implements Disposable {
    private final Project project;
    private final JTextArea logs = new JTextArea();
    private final JPanel display = new JPanel(new CardLayout());
    private final AtomicInteger generation = new AtomicInteger();
    private final JBCefBrowser browser;
    private OSProcessHandler process;
    private Path component;
    private Path runtimeRoot;
    private String runtimeUrl;
    private boolean enabled;
    private boolean starting;
    private volatile boolean disposed;

    PreviewPanel(Project project) {
        super(new BorderLayout());
        this.project = project;

        // Center the guidance when no component is available to preview.
        var empty = new JBPanelWithEmptyText().withEmptyText("No preview available");
        empty.getEmptyText().setShowAboveCenter(false)
            .appendLine("Open a .svelte file to see its preview.");
        display.add(empty, "empty");

        // Surface process output only when starting the preview or reporting a failure.
        logs.setEditable(false);
        logs.setLineWrap(true);
        logs.setWrapStyleWord(true);
        display.add(new JScrollPane(logs), "logs");

        // Copy complete remote frames so skipped Swing paints cannot leave preview contents blank or clipped.
        browser = JBCefApp.isSupported() ? JBCefBrowser.createBuilder()
            .setOSRHandlerFactory(new JBCefOSRHandlerFactory() {
                @Override
                public @NotNull CefRenderHandler createCefRenderHandler(@NotNull JComponent component) {
                    return PreviewRendering.fullFrameUpdates(JBCefOSRHandlerFactory.super.createCefRenderHandler(component));
                }
            }).build() : null;
        if (browser != null) {
            Disposer.register(this, browser);
            display.add(browser.getComponent(), "preview");
        }
        add(display, BorderLayout.CENTER);

        // Follow the IDE appearance independently of the operating system's browser theme.
        ApplicationManager.getApplication().getMessageBus().connect(this).subscribe(LafManagerListener.TOPIC, manager -> {
            if (enabled && runtimeUrl != null) showPreview();
        });
    }

    void setRuntimeActive(boolean value) {
        // Toggling the preview off ends its runtime session.
        if (disposed || enabled == value) return;
        enabled = value;
        if (enabled) startRuntime();
        else stopRuntime();
    }

    AnAction previewActions() {
        // Keep the options in a native action menu with their existing availability checks.
        var settings = new DefaultActionGroup();
        settings.add(previewAction("Refresh", "Reload the current preview", () -> browser != null && runtimeUrl != null,
            () -> browser.getCefBrowser().reload()));
        settings.add(previewAction("Create preview", "Create or open this component's preview definition", () -> component != null,
            this::createPreview));
        settings.add(previewAction("Open in browser", "Open the current preview in your browser", () -> runtimeUrl != null && component != null,
            () -> BrowserUtil.browse(previewUrl())));
        settings.addSeparator();
        settings.add(previewAction("Restart", "Restart the Node.js preview server", () -> component != null,
            this::startRuntime));

        // Anchor the popup's right edge beneath the gear using the platform's popup positioning.
        return new DumbAwareAction("Preview settings", "Preview options", AllIcons.General.GearPlain) {
            @Override
            public void actionPerformed(@NotNull AnActionEvent event) {
                if (disposed) return;
                var popup = JBPopupFactory.getInstance().createActionGroupPopup(
                    null, settings, event.getDataContext(), JBPopupFactory.ActionSelectionAid.SPEEDSEARCH, false);
                var input = event.getInputEvent();
                if (input != null && input.getComponent().isShowing()) {
                    popup.show(PopupShowOptions.belowComponentRightAligned(input.getComponent()));
                } else {
                    popup.showInBestPositionFor(event.getDataContext());
                }
            }
        };
    }

    private AnAction previewAction(String text, String description, BooleanSupplier available, Runnable action) {
        return new DumbAwareAction(text, description, null) {
            @Override
            public @NotNull ActionUpdateThread getActionUpdateThread() {
                return ActionUpdateThread.EDT;
            }

            @Override
            public void update(@NotNull AnActionEvent event) {
                event.getPresentation().setEnabled(!disposed && enabled && available.getAsBoolean());
            }

            @Override
            public void actionPerformed(@NotNull AnActionEvent event) {
                if (!disposed && enabled && available.getAsBoolean()) action.run();
            }
        };
    }

    void select(Path selected) {
        // Ignore editor files that do not map to a component preview.
        Path next = PreviewPaths.componentFor(selected);
        if (next == null || next.equals(component)) return;
        component = next;

        // Restart for a different workspace package instead of rendering it with the previous package's config.
        if (enabled) {
            try {
                if ((!starting && process == null) || !PreviewPaths.projectRoot(component).equals(runtimeRoot)) startRuntime();
                else showPreview();
            } catch (Exception error) {
                stopRuntime();
                showFailure(error.getMessage());
            }
        }
    }

    private void startRuntime() {
        // Resolve launch inputs on the UI thread before dispatching process creation to the pool.
        if (!enabled || component == null) {
            cards("empty");
            return;
        }
        stopRuntime();
        final Path root;
        final Path script;
        try {
            root = PreviewPaths.projectRoot(component);
            script = PreviewPaths.runtimeScript(root);
        } catch (Exception error) {
            showFailure(error.getMessage());
            return;
        }
        String interpreterReference = PropertiesComponent.getInstance(project).getValue("svelte-preview.node", "node");
        int ticket = generation.incrementAndGet();
        runtimeRoot = root;
        starting = true;
        logs.setText("Starting preview…\n");
        cards("logs");

        // Resolve the selected IDE interpreter off the UI thread and run its actual executable.
        ApplicationManager.getApplication().executeOnPooledThread(() -> {
            try {
                var interpreter = NodeJsInterpreterRef.create(interpreterReference).resolveAsLocal(project);
                var command = new GeneralCommandLine(interpreter.getInterpreterSystemDependentPath())
                    .withParameters(script.toString(), "--root", root.toString(), "--port", "0")
                    .withWorkDirectory(root.toFile())
                    .withCharset(StandardCharsets.UTF_8)
                    .withParentEnvironmentType(GeneralCommandLine.ParentEnvironmentType.CONSOLE);
                var handler = new OSProcessHandler(command);
                var pending = new StringBuilder();
                handler.addProcessListener(new ProcessAdapter() {
                    @Override
                    public void onTextAvailable(@NotNull ProcessEvent event, @NotNull Key outputType) {
                        // Readiness can arrive split across process output chunks.
                        String text = event.getText();
                        ui(ticket, () -> {
                            logs.append(text);
                            if (logs.getDocument().getLength() > 20000) logs.replaceRange("", 0, 10000);
                        });
                        if (outputType != ProcessOutputTypes.STDOUT) return;
                        synchronized (pending) {
                            pending.append(text);
                            int end;
                            while ((end = pending.indexOf("\n")) >= 0) {
                                String line = pending.substring(0, end).trim();
                                pending.delete(0, end + 1);
                                if (line.startsWith("SVELTE_PREVIEW_READY ")) {
                                    String url = JsonParser.parseString(line.substring(21)).getAsJsonObject().get("url").getAsString();
                                    ui(ticket, () -> {
                                        runtimeUrl = url;
                                        starting = false;
                                        showPreview();
                                    });
                                }
                            }
                        }
                    }

                    @Override
                    public void processTerminated(@NotNull ProcessEvent event) {
                        ui(ticket, () -> {
                            process = null;
                            runtimeUrl = null;
                            starting = false;
                            logs.append("\nPreview exited (" + event.getExitCode() + ").\n");
                            cards("logs");
                        });
                    }
                });

                // Dispose stale launches when a user stops or switches package during startup.
                ApplicationManager.getApplication().invokeLater(() -> {
                    if (disposed || generation.get() != ticket) {
                        handler.startNotify();
                        handler.destroyProcess();
                        return;
                    }
                    process = handler;
                    handler.startNotify();
                });
            } catch (Exception error) {
                ui(ticket, () -> {
                    starting = false;
                    showFailure(error.getMessage());
                });
            }
        });
    }

    private void showPreview() {
        if (runtimeUrl == null || component == null) return;
        String url = previewUrl();
        if (browser != null) {
            browser.loadURL(url);
            cards("preview");
        } else {
            logs.setText("Embedded browser unavailable in this IDE runtime. Choose Preview settings → Open in browser:\n" + url);
            cards("logs");
        }
    }

    private String previewUrl() {
        return PreviewPaths.previewUrl(runtimeUrl, runtimeRoot, component) + "&ideTheme=" + (JBColor.isBright() ? "light" : "dark");
    }

    CompletableFuture<JsonObject> inspectPreview(String state) {
        // Use the same lifecycle as the tool window and leave the current editor selection alone.
        var preview = new JsonObject();
        if (disposed || !enabled || component == null) {
            return CompletableFuture.completedFuture(PreviewInspection.withStatus(preview, "inactive"));
        }
        if (runtimeUrl == null) {
            return CompletableFuture.completedFuture(PreviewInspection.withStatus(preview, starting ? "starting" : "unavailable"));
        }

        // Share the exact URL and component path used by the embedded browser.
        preview.addProperty("galleryUrl", previewUrl());
        preview.addProperty("packageRoot", runtimeRoot.toString());
        preview.addProperty("component", PreviewPaths.relativeComponent(runtimeRoot, component));
        if (browser == null) {
            return CompletableFuture.completedFuture(PreviewInspection.withStatus(preview, "unavailable"));
        }
        return PreviewInspection.read(browser.getCefBrowser(), preview, state);
    }

    private void createPreview() {
        // Scaffold an adjacent preview without replacing existing user data.
        if (component == null) {
            cards("empty");
            return;
        }
        String filename = component.getFileName().toString();
        String stem = filename.substring(0, filename.length() - 7);
        Path preview = component.resolveSibling(stem + ".preview.ts");
        Path javascriptPreview = component.resolveSibling(stem + ".preview.js");
        Path existing = Files.exists(preview) ? preview : Files.exists(javascriptPreview) ? javascriptPreview : null;
        if (existing != null) {
            var file = LocalFileSystem.getInstance().refreshAndFindFileByNioFile(existing);
            if (file != null) FileEditorManager.getInstance(project).openFile(file, true);
            return;
        }

        // Preserve unusual component filenames by escaping the import specifier as a JSON string.
        String importPath = new com.google.gson.Gson().toJson("./" + filename);
        String text = "import Component from " + importPath + ";\nimport { definePreviews } from 'svelte-preview';\n\nexport default definePreviews(Component, {\n  Default: {\n    // Supply this component's required props here.\n    props: {}\n  }\n});\n";
        WriteCommandAction.runWriteCommandAction(project, () -> {
            try {
                var parent = LocalFileSystem.getInstance().refreshAndFindFileByNioFile(preview.getParent());
                if (parent == null) throw new IllegalStateException("Could not find the component directory.");
                var file = parent.createChildData(this, preview.getFileName().toString());
                VfsUtil.saveText(file, text);
                FileEditorManager.getInstance(project).openFile(file, true);
                showPreview();
            } catch (Exception error) {
                showFailure(error.getMessage());
            }
        });
    }

    private void stopRuntime() {
        // Invalidate callbacks before destroying the child to prevent late output from reopening a stopped preview.
        generation.incrementAndGet();
        runtimeUrl = null;
        if (process != null) process.destroyProcess();
        process = null;
        starting = false;
        cards(component == null ? "empty" : "logs");
    }

    private void showFailure(String message) {
        logs.append("\nPreview could not start.\n" + message + "\n");
        cards("logs");
    }

    private void cards(String name) {
        ((CardLayout) display.getLayout()).show(display, name);
    }

    private void ui(int ticket, Runnable action) {
        ApplicationManager.getApplication().invokeLater(() -> {
            if (!disposed && generation.get() == ticket) action.run();
        });
    }

    @Override
    public void dispose() {
        disposed = true;
        stopRuntime();
    }
}
