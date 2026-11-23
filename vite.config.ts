import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import masterHandler from "./api/master.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "rerun-local-api",
      configureServer(server) {
        process.env.VITE_SUPABASE_URL ??= server.config.env.VITE_SUPABASE_URL;
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??=
          server.config.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        server.middlewares.use("/api/master", async (req, res) => {
          let text = "";
          for await (const chunk of req) {
            text += chunk;
            if (text.length > 4_400_000) {
              res.statusCode = 413;
              res.end("Upload too large");
              return;
            }
          }
          const request = Object.assign(req, {
            body: text ? JSON.parse(text) : {},
          }) as VercelRequest;
          const response = Object.assign(res, {
            status(code: number) {
              res.statusCode = code;
              return this;
            },
            json(value: unknown) {
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(value));
              return this;
            },
          }) as unknown as VercelResponse;
          await masterHandler(request, response);
        });
      },
    },
  ],
});
