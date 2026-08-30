import react from "@vitejs/plugin-react";
import { sites } from "@openai/sites-vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), sites()],
  server: {
    proxy: {
      "/api": "http://localhost:4177"
    }
  }
});
