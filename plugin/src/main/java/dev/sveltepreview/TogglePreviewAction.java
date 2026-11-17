package dev.sveltepreview;

import com.intellij.openapi.actionSystem.AnActionEvent;
import com.intellij.openapi.actionSystem.ActionUpdateThread;
import com.intellij.openapi.actionSystem.ToggleAction;
import com.intellij.openapi.project.DumbAware;
import org.jetbrains.annotations.NotNull;

public final class TogglePreviewAction extends ToggleAction implements DumbAware {
    @Override
    public @NotNull ActionUpdateThread getActionUpdateThread() {
        return ActionUpdateThread.EDT;
    }

    @Override
    public boolean isSelected(@NotNull AnActionEvent event) {
        var project = event.getProject();
        return project != null && PreviewToolWindowFactory.isPreviewEnabled(project);
    }

    @Override
    public void setSelected(@NotNull AnActionEvent event, boolean selected) {
        // Toggle the preference even when another file type has temporarily hidden the window.
        var project = event.getProject();
        if (project != null) PreviewToolWindowFactory.setPreviewEnabled(project, selected);
    }

    @Override
    public void update(@NotNull AnActionEvent event) {
        super.update(event);
        event.getPresentation().setEnabled(event.getProject() != null);
    }
}
