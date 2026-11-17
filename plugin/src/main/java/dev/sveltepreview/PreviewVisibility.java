package dev.sveltepreview;

final class PreviewVisibility {
    private boolean enabled;
    private boolean visible;
    private boolean svelteSelected;

    PreviewVisibility(boolean enabled) {
        this.enabled = enabled;
    }

    boolean isEnabled() {
        return enabled;
    }

    boolean isVisible() {
        return visible;
    }

    void selectFile(String name) {
        // Temporarily hide other file types without changing the user's preference.
        svelteSelected = name != null && name.endsWith(".svelte");
        visible = enabled && svelteSelected;
    }

    void setEnabled(boolean value) {
        enabled = value;
        visible = enabled && svelteSelected;
    }

    void windowVisibilityChanged(boolean value) {
        // Notifications matching our requested visibility are automatic, not user toggles.
        if (visible == value) return;
        setEnabled(value);
    }
}
