import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const entry = fileURLToPath(new URL('./src/index.ts', import.meta.url))

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  build: {
    emptyOutDir: false,
    lib: {
      entry,
      formats: ['es'],
      fileName: 'index',
      cssFileName: 'styles',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: { banner: '"use client";' },
    },
  },
})
