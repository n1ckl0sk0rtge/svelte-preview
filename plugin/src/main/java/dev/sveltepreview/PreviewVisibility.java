package dev.sveltepreview;

final class PreviewVisibility {
    private boolean enabled;
    private boolean visible;
    private boolean svelteSelected;
    private boolean runtimeActive;

    PreviewVisibility(boolean enabled) {
        this.enabled = enabled;
    }

    boolean isEnabled() {
        return enabled;
    }

    boolean isVisible() {
        return visible;
    }

    boolean isRuntimeActive() {
        return runtimeActive;
    }

    void selectFile(String name) {
        // Temporarily hide other file types without changing the user's preference.
        svelteSelected = name != null && name.endsWith(".svelte");
        followSelection();
    }

    void setEnabled(boolean value) {
        enabled = value;
        followSelection();
    }

    private void followSelection() {
        // Keep an existing preview available to MCP while focus moves away from the component.
        visible = enabled && svelteSelected;
        runtimeActive = enabled && (runtimeActive || svelteSelected);
    }

    void windowVisibilityChanged(boolean value, boolean hideAction) {
        // Our own visibility changes already match the native notification.
        if (visible == value) return;

        // Another tool window can cover this one without closing its preview.
        if (value || hideAction) setEnabled(value);
        else visible = false;
    }
}
