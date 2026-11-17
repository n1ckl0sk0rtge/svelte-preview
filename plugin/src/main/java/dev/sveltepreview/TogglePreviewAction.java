package dev.sveltepreview;

import com.intellij.openapi.actionSystem.AnActionEvent;
import com.intellij.openapi.actionSystem.ActionUpdateThread;
import com.intellij.openapi.actionSystem.ToggleAction;
import com.intellij.openapi.project.DumbAware;
import com.intellij.openapi.wm.ToolWindow;
import com.intellij.openapi.wm.ToolWindowManager;
import org.jetbrains.annotations.NotNull;

public final class TogglePreviewAction extends ToggleAction implements DumbAware {
    @Override
    public @NotNull ActionUpdateThread getActionUpdateThread() {
        return ActionUpdateThread.EDT;
    }

    @Override
    public boolean isSelected(@NotNull AnActionEvent event) {
        ToolWindow window = previewWindow(event);
        return window != null && window.isVisible();
    }

    @Override
    public void setSelected(@NotNull AnActionEvent event, boolean selected) {
        // Use the same visibility switch as the native tool window's show and hide actions.
        ToolWindow window = previewWindow(event);
        if (window == null) return;
        if (selected) window.show();
        else window.hide();
    }

    @Override
    public void update(@NotNull AnActionEvent event) {
        super.update(event);
        event.getPresentation().setEnabled(event.getProject() != null);
    }

    private ToolWindow previewWindow(AnActionEvent event) {
        return event.getProject() == null ? null : ToolWindowManager.getInstance(event.getProject()).getToolWindow("Svelte Preview");
    }
}
