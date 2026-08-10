/** @type {import("prettier").Config} */
export default {
    tabWidth: 4,
    printWidth: 120,
    tailwindStylesheet: "./src/styles/global.css",
    // prettier-plugin-tailwindcss must be loaded last.
    plugins: ["prettier-plugin-astro", "prettier-plugin-tailwindcss"],
    overrides: [
        {
            files: "*.astro",
            options: { parser: "astro" },
        },
    ],
};
