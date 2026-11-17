package dev.sveltepreview;

import com.intellij.ide.util.PropertiesComponent;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.wm.ToolWindow;
import com.intellij.openapi.wm.ToolWindowFactory;
import com.intellij.openapi.wm.ToolWindowManager;
import com.intellij.openapi.wm.ex.ToolWindowManagerListener;
import com.intellij.ui.content.ContentFactory;
import org.jetbrains.annotations.NotNull;

import java.util.List;

public final class PreviewToolWindowFactory implements ToolWindowFactory {
    @Override
    public void init(@NotNull ToolWindow toolWindow) {
        // Restore the project's preview preference even before its content has been created.
        var project = toolWindow.getProject();
        ApplicationManager.getApplication().invokeLater(() -> {
            if (project.isDisposed() || toolWindow.isDisposed()) return;
            var properties = PropertiesComponent.getInstance(project);
            if (!properties.isValueSet("svelte-preview.enabled")) return;
            if (properties.getBoolean("svelte-preview.enabled")) toolWindow.show();
            else toolWindow.hide();
        });
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

        // Native hide/show controls and the shortcut share one project-wide runtime lifecycle.
        project.getMessageBus().connect(panel).subscribe(ToolWindowManagerListener.TOPIC, new ToolWindowManagerListener() {
            @Override
            public void stateChanged(@NotNull ToolWindowManager manager) {
                if (!project.isDisposed() && !toolWindow.isDisposed()) panel.setPreviewEnabled(toolWindow.isVisible());
            }
        });
        ApplicationManager.getApplication().invokeLater(() -> {
            if (!project.isDisposed() && !toolWindow.isDisposed()) panel.setPreviewEnabled(toolWindow.isVisible());
        });
    }
}
