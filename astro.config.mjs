import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import vercel from "@astrojs/vercel";

// https://astro.build/config
export default defineConfig({
    integrations: [react()],
    adapter: vercel(),

    vite: {
        plugins: [tailwindcss()],
        // Vite 8 / Rolldown prebundles deps with NODE_ENV=production by default.
        // React's jsx-dev-runtime then exports jsxDEV=undefined and islands crash
        // with "_jsxDEV is not a function" (Search, Favorites). Force development
        // for the optimizer only — this option is unused during `astro build`.
        optimizeDeps: {
            rolldownOptions: {
                transform: {
                    define: {
                        "process.env.NODE_ENV": JSON.stringify("development"),
                    },
                },
            },
        },
    },
});
