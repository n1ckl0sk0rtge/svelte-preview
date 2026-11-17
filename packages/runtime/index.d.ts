import type { Component, ComponentProps } from 'svelte';
import type { PluginOption } from 'vite';

export interface Viewport {
  width: number;
  height: number;
}

/** Auto fills the canvas width and follows the component's content height. */
export type PreviewViewport = Viewport | 'auto';

/** Runs during Svelte initialization. May provide context and return synchronous cleanup. */
export type PreviewSetup = (context: PreviewSetupContext) => void | (() => void);

export interface PreviewHttpResponse {
  /** JSON response body. Defaults to null. */
  body?: unknown;
  /** HTTP status code. Defaults to 200. */
  status?: number;
  /** Keep the request pending until it is cancelled or the preview closes. */
  pending?: boolean;
}

/** Register responses by HTTP method and pathname, e.g. http.get('/api/products', { body: products }). */
export interface PreviewHttp {
  get(path: string, response: PreviewHttpResponse): void;
  post(path: string, response: PreviewHttpResponse): void;
  put(path: string, response: PreviewHttpResponse): void;
  patch(path: string, response: PreviewHttpResponse): void;
  delete(path: string, response: PreviewHttpResponse): void;
  head(path: string, response: PreviewHttpResponse): void;
  options(path: string, response: PreviewHttpResponse): void;
}

export interface PreviewSetupContext {
  /** HTTP responses registered here are automatically cleaned up when the preview closes. */
  http: PreviewHttp;
  /** Release custom resources when the preview closes. Callbacks run once in reverse order. */
  onCleanup(callback: () => void): void;
}

export interface PreviewState<Props> {
  props: Props;
  /** Creates dependencies for this preview before its component and descendants initialize. */
  setup?: PreviewSetup;
  /** Size of this named preview. Omit to use the project default; auto follows the canvas and content. */
  viewport?: PreviewViewport;
}

export interface PreviewDefinition<C extends Component<any>> {
  component: C;
  states: Record<string, PreviewState<ComponentProps<C>>>;
}

export type PreviewTheme = 'auto' | 'light' | 'dark';

export interface PreviewConfig {
  /** Paths relative to the directory containing svelte-preview.config.ts. */
  styles?: string[];
  /** Vite plugins needed by the preview, e.g. Tailwind. Restart after changing these. */
  plugins?: PluginOption[];
  /** Self-contained browser hook, or path to a module exporting one. Runs before each state's setup. */
  setup?: PreviewSetup | string;
  /** Fallback size for previews that do not specify their own viewport. Defaults to auto. */
  viewport?: PreviewViewport;
  /** Defaults to auto: follow the IDE appearance, or the browser preference in standalone use. */
  theme?: PreviewTheme;
  /** Project aliases, e.g. { '@ui': './src/ui' }. $lib is included automatically. */
  aliases?: Record<string, string>;
}

export function definePreviews<C extends Component<any>>(
  component: C,
  states: Record<string, PreviewState<ComponentProps<C>>>
): PreviewDefinition<C>;

export function defineConfig(config: PreviewConfig): PreviewConfig;
