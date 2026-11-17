package dev.sveltepreview;

import com.intellij.ide.util.PropertiesComponent;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.fileEditor.FileEditorManager;
import com.intellij.openapi.fileEditor.FileEditorManagerEvent;
import com.intellij.openapi.fileEditor.FileEditorManagerListener;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.util.Key;
import com.intellij.openapi.vfs.VirtualFile;
import com.intellij.openapi.wm.ToolWindow;
import com.intellij.openapi.wm.ToolWindowFactory;
import com.intellij.openapi.wm.ToolWindowManager;
import com.intellij.openapi.wm.ex.ToolWindowManagerListener;
import com.intellij.ui.content.ContentFactory;
import org.jetbrains.annotations.NotNull;

import java.nio.file.Path;
import java.util.List;

public final class PreviewToolWindowFactory implements ToolWindowFactory {
    private static final Key<VisibilityController> VISIBILITY = Key.create("svelte-preview.visibility");

    @Override
    public void init(@NotNull ToolWindow toolWindow) {
        // Watch selections before lazy content creation so restored previews can reopen on Svelte files.
        var project = toolWindow.getProject();
        var controller = new VisibilityController(project, toolWindow);
        project.putUserData(VISIBILITY, controller);
        var connection = project.getMessageBus().connect(project);
        connection.subscribe(FileEditorManagerListener.FILE_EDITOR_MANAGER, new FileEditorManagerListener() {
            @Override
            public void selectionChanged(@NotNull FileEditorManagerEvent event) {
                controller.selectFile(event.getNewFile());
            }
        });
        connection.subscribe(ToolWindowManagerListener.TOPIC, new ToolWindowManagerListener() {
            @Override
            public void stateChanged(@NotNull ToolWindowManager manager) {
                controller.windowVisibilityChanged();
            }
        });

        // Wait for the platform to finish restoring its tool window layout.
        ApplicationManager.getApplication().invokeLater(controller::restore);
    }

    @Override
    public void createToolWindowContent(@NotNull Project project, @NotNull ToolWindow toolWindow) {
        // Tie the browser and child process to the tool window content's lifetime.
        var panel = new PreviewPanel(project);
        var content = ContentFactory.getInstance().createContent(panel, "", false);
        content.setDisposer(panel);
        toolWindow.getContentManager().addContent(content);

        // Put the preview gear on the right of the native title bar beside the window controls.
        toolWindow.setTitleActions(List.of(panel.previewActions()));

        // Keep runtime activity tied to the panel's temporary visibility, not the saved preference.
        var controller = project.getUserData(VISIBILITY);
        controller.panel = panel;
        ApplicationManager.getApplication().invokeLater(controller::selectCurrentFile);
    }

    static boolean isPreviewEnabled(Project project) {
        var controller = project.getUserData(VISIBILITY);
        return controller != null && controller.state != null && controller.state.isEnabled();
    }

    static void setPreviewEnabled(Project project, boolean enabled) {
        // The shortcut must also disable previews while they are temporarily hidden.
        var controller = project.getUserData(VISIBILITY);
        if (controller == null) return;
        controller.restore();
        if (controller.state == null) return;
        controller.state.setEnabled(enabled);
        controller.apply();
    }

    private static final class VisibilityController {
        private final Project project;
        private final ToolWindow window;
        private PreviewVisibility state;
        private PreviewPanel panel;

        private VisibilityController(Project project, ToolWindow window) {
            this.project = project;
            this.window = window;
        }

        private void restore() {
            // Restore the explicit preference independently of the platform's saved visibility.
            if (unavailable() || state != null) return;
            state = new PreviewVisibility(PropertiesComponent.getInstance(project)
                .getBoolean("svelte-preview.enabled", window.isVisible()));
            selectCurrentFile();
        }

        private void selectCurrentFile() {
            if (unavailable()) return;
            var files = FileEditorManager.getInstance(project).getSelectedFiles();
            selectFile(files.length == 0 ? null : files[0]);
        }

        private void selectFile(VirtualFile file) {
            // Only actual Svelte editor tabs should reveal the preview, including after all tabs close.
            if (unavailable() || state == null) return;
            state.selectFile(file == null ? null : file.getName());
            if (panel != null && file != null && "svelte".equals(file.getExtension())) {
                panel.select(Path.of(file.getPath()));
            }

            // Apply the selection after updating the component so resuming uses the right package.
            apply();
        }

        private void windowVisibilityChanged() {
            if (unavailable() || state == null) return;
            state.windowVisibilityChanged(window.isVisible());
            apply();
        }

        private void apply() {
            // Save only the preference; automatic hides must not disable future Svelte previews.
            PropertiesComponent.getInstance(project).setValue("svelte-preview.enabled", Boolean.toString(state.isEnabled()));
            if (panel != null) panel.setPreviewEnabled(state.isVisible());

            // Record desired visibility in the state before synchronous native notifications arrive.
            if (window.isVisible() == state.isVisible()) return;
            if (state.isVisible()) window.show();
            else window.hide();
        }

        private boolean unavailable() {
            return project.isDisposed() || window.isDisposed();
        }
    }
}
