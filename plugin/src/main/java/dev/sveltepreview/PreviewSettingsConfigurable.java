package dev.sveltepreview;

import com.intellij.ide.util.PropertiesComponent;
import com.intellij.execution.ExecutionException;
import com.intellij.javascript.nodejs.interpreter.NodeJsInterpreterField;
import com.intellij.javascript.nodejs.interpreter.NodeJsInterpreterRef;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.application.ModalityState;
import com.intellij.openapi.options.Configurable;
import com.intellij.openapi.project.Project;
import com.intellij.ui.components.JBLabel;
import com.intellij.util.ui.FormBuilder;
import com.intellij.util.ui.UIUtil;

import javax.swing.*;
import java.awt.*;

public final class PreviewSettingsConfigurable implements Configurable {
    private final Project project;
    private NodeJsInterpreterField node;
    private JBLabel runtimeDetails;
    private int detailsGeneration;

    public PreviewSettingsConfigurable(Project project) {
        this.project = project;
    }

    @Override
    public String getDisplayName() {
        return "Svelte Preview";
    }

    @Override
    public JComponent createComponent() {
        // Reuse the IDE's local interpreter discovery, version display, and manual-path dialog.
        node = new NodeJsInterpreterField(project, false);
        var label = new JBLabel("Node.js interpreter:");
        label.setLabelFor(node.getChildComponent());
        runtimeDetails = new JBLabel(" ", UIUtil.ComponentStyle.SMALL, UIUtil.FontColor.BRIGHTER);
        runtimeDetails.setCopyable(true);
        runtimeDetails.setVerticalAlignment(SwingConstants.TOP);
        node.addChangeListener(this::updateRuntimeDetails);

        // Keep the entire form at the top, with explanatory text aligned beneath the selector.
        var help = new JBLabel("<html>Runs the local Svelte preview server. Requires Node.js 22.12+ or 24+.<br>"
            + "Choose a detected local interpreter, or use the browse button to add its executable path.<br>"
            + "Saved for this IDE project. After changing it, choose Restart from the preview's settings gear.</html>");
        help.setVerticalAlignment(SwingConstants.TOP);
        var form = FormBuilder.createFormBuilder()
            .addLabeledComponent(label, node)
            .addComponentToRightColumn(runtimeDetails)
            .addComponentToRightColumn(help, 8)
            .getPanel();
        var panel = new JPanel(new BorderLayout());
        panel.add(form, BorderLayout.NORTH);
        reset();
        return panel;
    }

    private String interpreterReference() {
        return node.getInterpreterRef().getReferenceName();
    }

    private void updateRuntimeDetails(NodeJsInterpreterRef reference) {
        // Resolve the full path and version without blocking the Settings dialog.
        if (runtimeDetails == null || project.isDisposed()) return;
        int ticket = ++detailsGeneration;
        runtimeDetails.setText(" ");
        ApplicationManager.getApplication().executeOnPooledThread(() -> {
            try {
                var interpreter = reference.resolveAsLocal(project);
                String path = interpreter.getInterpreterSystemDependentPath();
                interpreter.provideCachedVersionOrFetch(version ->
                    showRuntimeDetails(ticket, version == null ? path : path + " (v" + version + ")"));
            } catch (ExecutionException error) {
                showRuntimeDetails(ticket, error.getMessage());
            }
        });
    }

    private void showRuntimeDetails(int ticket, String text) {
        // Ignore stale detection results after a selection change or the dialog has closed.
        ApplicationManager.getApplication().invokeLater(() -> {
            if (runtimeDetails != null && detailsGeneration == ticket && !project.isDisposed()) {
                runtimeDetails.setText(text);
                runtimeDetails.setToolTipText(text);
            }
        }, ModalityState.any());
    }

    @Override
    public boolean isModified() {
        return node != null && !interpreterReference().equals(PropertiesComponent.getInstance(project).getValue("svelte-preview.node", "node"));
    }

    @Override
    public void apply() {
        PropertiesComponent.getInstance(project).setValue("svelte-preview.node", interpreterReference(), "node");
    }

    @Override
    public void reset() {
        if (node != null) {
            var reference = NodeJsInterpreterRef.create(PropertiesComponent.getInstance(project).getValue("svelte-preview.node", "node"));
            node.setInterpreterRef(reference);
            updateRuntimeDetails(reference);
        }
    }

    @Override
    public void disposeUIResources() {
        node = null;
        runtimeDetails = null;
        detailsGeneration++;
    }
}
