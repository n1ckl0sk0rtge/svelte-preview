package dev.sveltepreview;

import org.junit.Test;

import static org.junit.Assert.*;

public class PreviewVisibilityTest {
    @Test
    public void hidesForOtherFilesAndReturnsToTheSameComponent() {
        // Begin with previews enabled for the current Svelte component.
        var visibility = new PreviewVisibility(true);
        visibility.selectFile("Card.svelte");
        visibility.windowVisibilityChanged(true);
        assertTrue(visibility.isVisible());

        // Native hide notifications must preserve the preference across multiple unrelated tabs.
        for (String file : new String[]{"README.md", "app.css", "Card.preview.ts", "Card.preview.js", "package.json"}) {
            visibility.selectFile(file);
            visibility.windowVisibilityChanged(false);
            assertFalse(visibility.isVisible());
            assertTrue(visibility.isEnabled());
        }

        // Returning to the original file must restore visibility even without a component change.
        visibility.selectFile("Card.svelte");
        visibility.windowVisibilityChanged(true);
        assertTrue(visibility.isVisible());
        assertTrue(visibility.isEnabled());
    }

    @Test
    public void manuallyHiddenPreviewStaysHiddenAcrossFileSelections() {
        // Closing a visible preview is an explicit choice to disable it.
        var visibility = new PreviewVisibility(true);
        visibility.selectFile("Card.svelte");
        visibility.windowVisibilityChanged(false);
        assertFalse(visibility.isEnabled());

        // Neither unrelated files nor another Svelte component should reopen it.
        for (String file : new String[]{"README.md", "Card.svelte", "Other.svelte"}) {
            visibility.selectFile(file);
            visibility.windowVisibilityChanged(false);
            assertFalse(visibility.isVisible());
            assertFalse(visibility.isEnabled());
        }
    }

    @Test
    public void disabledProjectDoesNotOpenPreviewsUntilExplicitlyShown() {
        // Opening a Svelte component must honor the saved disabled preference.
        var visibility = new PreviewVisibility(false);
        visibility.selectFile("Card.svelte");
        visibility.windowVisibilityChanged(false);
        assertFalse(visibility.isVisible());
        assertFalse(visibility.isEnabled());

        // Opening the native tool window enables automatic previews again.
        visibility.windowVisibilityChanged(true);
        assertTrue(visibility.isVisible());
        assertTrue(visibility.isEnabled());
    }

    @Test
    public void shortcutCanDisableATemporarilyHiddenPreview() {
        // Hide automatically, then disable while no preview is visible.
        var visibility = new PreviewVisibility(true);
        visibility.selectFile("Card.svelte");
        visibility.selectFile("README.md");
        visibility.setEnabled(false);
        visibility.windowVisibilityChanged(false);

        // A subsequent component selection must honor that explicit shortcut action.
        visibility.selectFile("Card.svelte");
        assertFalse(visibility.isVisible());
        assertFalse(visibility.isEnabled());
    }

    @Test
    public void enablingOnAnotherFileWaitsForASvelteComponent() {
        // Enable the project while an unrelated editor tab is selected.
        var visibility = new PreviewVisibility(false);
        visibility.selectFile("README.md");
        visibility.setEnabled(true);
        visibility.windowVisibilityChanged(false);
        assertFalse(visibility.isVisible());
        assertTrue(visibility.isEnabled());

        // Only Svelte components reveal the panel.
        visibility.selectFile("Other.svelte");
        assertTrue(visibility.isVisible());
    }

    @Test
    public void closingAllEditorsTemporarilyHidesPreviews() {
        // Losing the selected editor should behave like selecting an unrelated file.
        var visibility = new PreviewVisibility(true);
        visibility.selectFile("Card.svelte");
        visibility.selectFile(null);
        visibility.windowVisibilityChanged(false);
        assertFalse(visibility.isVisible());
        assertTrue(visibility.isEnabled());

        // Reopening a Svelte file resumes the enabled project.
        visibility.selectFile("Card.svelte");
        assertTrue(visibility.isVisible());
    }

    @Test
    public void restoredPreferenceSurvivesRepeatedHiddenWindowEvents() {
        // Project startup may restore an enabled preview with an unrelated file selected.
        var visibility = new PreviewVisibility(true);
        visibility.selectFile("README.md");
        visibility.windowVisibilityChanged(false);
        visibility.windowVisibilityChanged(false);
        assertTrue(visibility.isEnabled());

        // Later tool window events must not undo the saved choice after the automatic show.
        visibility.selectFile("Card.svelte");
        visibility.windowVisibilityChanged(true);
        visibility.windowVisibilityChanged(true);
        assertTrue(visibility.isVisible());
        assertTrue(visibility.isEnabled());
    }
}
