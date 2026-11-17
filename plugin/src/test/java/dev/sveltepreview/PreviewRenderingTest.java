package dev.sveltepreview;

import org.cef.handler.CefNativeRenderHandler;
import org.cef.handler.CefRenderHandler;
import org.junit.Test;

import java.awt.Rectangle;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.*;

public class PreviewRenderingTest {
    @Test
    public void sharedMemoryPaintsCopyTheFullRasterWhilePreservingPacketDetails() {
        // Capture the packet reaching the platform after intermediate paints could have been skipped.
        var received = new AtomicReference<Object[]>();
        var handler = nativeHandler((proxy, method, arguments) -> {
            received.set(arguments);
            return null;
        });
        var wrapped = (CefNativeRenderHandler) PreviewRendering.fullFrameUpdates(handler);

        // Ignore the latest packet's partial damage list without changing its memory, dimensions, or popup flag.
        wrapped.onPaintWithSharedMem(null, false, 3, "frame-memory", 42L, 1800, 2200);
        assertArrayEquals(new Object[]{null, false, 0, "frame-memory", 42L, 1800, 2200}, received.get());
        wrapped.onPaintWithSharedMem(null, true, 1, "popup-memory", 43L, 200, 100);
        assertArrayEquals(new Object[]{null, true, 0, "popup-memory", 43L, 200, 100}, received.get());
    }

    @Test
    public void otherCallbacksRetainTheirReturnValuesAndFailureCauses() {
        // The adapter must preserve normal browser sizing and native resource cleanup behavior.
        var rectangle = new Rectangle(0, 0, 900, 1100);
        var failure = new IllegalStateException("Cleanup failed");
        var wrapped = (CefNativeRenderHandler) PreviewRendering.fullFrameUpdates(nativeHandler((proxy, method, arguments) -> {
            if (method.getName().equals("getViewRect")) return rectangle;
            throw failure;
        }));
        assertSame(rectangle, wrapped.getViewRect(null));
        assertSame(failure, assertThrows(IllegalStateException.class, wrapped::disposeNativeResources));
    }

    @Test
    public void adapterKeepsItsOwnIdentity() {
        // Handler collection lookups must remain reflexive even though callbacks go to another object.
        var handler = nativeHandler((proxy, method, arguments) -> null);
        var wrapped = PreviewRendering.fullFrameUpdates(handler);
        assertEquals(wrapped, wrapped);
        assertFalse(wrapped.equals(handler));
        assertEquals(System.identityHashCode(wrapped), wrapped.hashCode());
    }

    @Test
    public void inProcessRenderingKeepsTheOriginalHandler() {
        // Shared-memory adaptation must not affect IDEs running JCEF in process.
        var handler = (CefRenderHandler) Proxy.newProxyInstance(
            CefRenderHandler.class.getClassLoader(), new Class<?>[]{CefRenderHandler.class},
            (proxy, method, arguments) -> null);
        assertSame(handler, PreviewRendering.fullFrameUpdates(handler));
    }

    private static CefNativeRenderHandler nativeHandler(InvocationHandler invocation) {
        return (CefNativeRenderHandler) Proxy.newProxyInstance(
            CefNativeRenderHandler.class.getClassLoader(), new Class<?>[]{CefNativeRenderHandler.class}, invocation);
    }
}
