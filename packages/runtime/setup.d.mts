import type { PreviewSetup } from './index.js';

export function runPreviewSetup(...setups: (PreviewSetup | undefined)[]): () => void;
