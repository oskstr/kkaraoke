import { defineConfig, fontProviders } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import vercel from "@astrojs/vercel";

// https://astro.build/config
export default defineConfig({
    site: "https://kkaraoke.vercel.app",
    integrations: [react()],
    adapter: vercel(),
    output: "static",
    prefetch: {
        defaultStrategy: "hover",
    },
    fonts: [
        {
            name: "Archivo",
            cssVariable: "--font-archivo",
            provider: fontProviders.fontsource(),
            // Variable file covers the weights used in the UI (regular through bold).
            weights: ["400 700"],
            styles: ["normal"],
            // latin-ext is required for Swedish å/ä/ö in the catalog.
            subsets: ["latin", "latin-ext"],
            fallbacks: ["sans-serif"],
        },
        {
            name: "DM Mono",
            cssVariable: "--font-dm-mono",
            provider: fontProviders.fontsource(),
            weights: [400, 500],
            styles: ["normal"],
            subsets: ["latin", "latin-ext"],
            fallbacks: ["monospace"],
        },
    ],

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
