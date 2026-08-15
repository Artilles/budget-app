import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Fixed, because src-tauri/tauri.conf.json points devUrl at this exact port.
    // strictPort makes a clash fail loudly rather than silently moving to 5181,
    // which would leave the desktop shell loading nothing.
    port: 5180,
    strictPort: true,
    watch: {
      // Rust build output is not frontend source. Watching it is useless work,
      // and worse: cargo holds a lock on the .dll while linking, so the watcher
      // hits EBUSY and takes the whole dev server down mid-build.
      ignored: ['**/src-tauri/**'],
    },
  },
})
