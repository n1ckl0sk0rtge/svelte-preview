package dev.sveltepreview;

import org.cef.handler.CefNativeRenderHandler;
import org.cef.handler.CefRenderHandler;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;

final class PreviewRendering {
    private PreviewRendering() {}

    static CefRenderHandler fullFrameUpdates(CefRenderHandler handler) {
        // Only remote JCEF uses shared-memory paint packets; keep the in-process handler as supplied.
        if (!(handler instanceof CefNativeRenderHandler)) return handler;

        // Swing may skip intermediate paints, so the latest dirty region can leave earlier frame content blank.
        // A zero rectangle count tells the platform handler to copy the complete shared-memory raster instead.
        return (CefNativeRenderHandler) Proxy.newProxyInstance(
            CefNativeRenderHandler.class.getClassLoader(), new Class<?>[]{CefNativeRenderHandler.class},
            (proxy, method, arguments) -> {
                // Keep the adapter's identity stable when the platform stores or compares handlers.
                if (method.getDeclaringClass() == Object.class) {
                    return switch (method.getName()) {
                        case "equals" -> proxy == arguments[0];
                        case "hashCode" -> System.identityHashCode(proxy);
                        default -> handler.toString();
                    };
                }

                // Request the full raster while retaining the rest of the native paint packet.
                if (method.getName().equals("onPaintWithSharedMem")) arguments[2] = 0;

                // Forward every other callback, including default methods and the original failure cause.
                try {
                    return method.invoke(handler, arguments);
                } catch (InvocationTargetException error) {
                    throw error.getCause();
                }
            });
    }
}
