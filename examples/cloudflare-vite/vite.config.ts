// import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  // TODO: generate wrangler.json
  // plugins: [react(), cloudflare()],
  plugins: [react()],
});
