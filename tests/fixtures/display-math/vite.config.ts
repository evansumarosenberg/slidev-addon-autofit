import { fileURLToPath } from 'node:url'

// This deck uses the default theme alongside the original fixture's custom
// theme. Separate optimization caches keep their dev servers independent.
export default {
  cacheDir: fileURLToPath(new URL('../../../node_modules/.vite-display-math', import.meta.url)),
}
