import { defineConfig } from "vite";
import { resolve } from 'path';

export default defineConfig({
    clearScreen: false,
    build: {
    lib: {
      entry: resolve(__dirname, 'src/injected.ts'),
      name: 'InjectedScript',
      fileName: () => 'injected.js',
      formats: ['cjs']
    },
    outDir: resolve(__dirname, 'src/assets'),
    emptyOutDir: false,
    minify: false
  }
} as any);