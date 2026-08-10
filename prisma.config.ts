import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// Prisma 7 does not load .env on its own. Deployments inject real environment
// variables and have no .env file, and `loadEnvFile` throws on a missing file.
if (existsSync(".env")) {
    process.loadEnvFile(".env");
}

export default defineConfig({
    schema: "prisma/schema.prisma",
    datasource: {
        // Read directly rather than via `env()` so that `prisma generate`,
        // which does not need a connection, still works when the variable is absent.
        url: process.env["DATABASE_URL"] ?? "",
    },
});
