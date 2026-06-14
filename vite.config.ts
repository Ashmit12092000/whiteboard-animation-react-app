import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from "path";

export default defineConfig({
  base: "/AnimeWhite/whiteboard/",
  plugins: [react()],
  server: {
    host: '::',
    port: 8083,
  },
  worker: {
    format: "es",
    plugins: () => [react()],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: 'build',
  },
});
