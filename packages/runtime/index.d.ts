import type { Component, ComponentProps } from 'svelte';
import type { PluginOption, UserConfig } from 'vite';

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

/** Static page values for the opt-in SvelteKit shims; these do not run route loaders. */
export interface PreviewSvelteKitPage {
  /** Absolute URL or path relative to http://preview.local. Defaults to /. */
  url?: string;
  params?: Record<string, string>;
  route?: { id: string | null };
  data?: Record<string, unknown>;
  state?: Record<string, unknown>;
  status?: number;
  error?: unknown;
  form?: unknown;
}

export interface PreviewSvelteKit {
  /** Top-level page fields override project defaults; supply data and params in full. */
  page?: PreviewSvelteKitPage;
}

export interface PreviewState<Props> {
  props: Props;
  /** Page fixtures for this frame. Requires sveltekit to be enabled in the project config. */
  sveltekit?: PreviewSvelteKit;
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
  /** Vite environment mode, selecting .env.[mode]. Defaults to preview; --mode takes precedence. */
  mode?: string;
  /** Vite constant replacements. String values must be JSON.stringify'd JavaScript expressions. */
  define?: UserConfig['define'];
  /** Opt into static $app/environment ($app/env), $app/state, and goto() shims. */
  sveltekit?: boolean | PreviewSvelteKit;
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
