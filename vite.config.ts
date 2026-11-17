import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // NEXUS_NATIVE=true builds the bundle that Android/iOS ship inside the app (relative URLs, no service worker).
  base: process.env.NEXUS_NATIVE === 'true' ? './' : process.env.GITHUB_PAGES === 'true' ? '/NEXUS-EQUALIZER/' : '/',
  plugins: [react()],
});