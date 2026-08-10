import { defineConfig } from "prisma/config";

export default defineConfig({
    schema: "prisma/schema.prisma",
    datasource: {
        // Read directly rather than via `env()` so that `prisma generate`,
        // which does not need a connection, still works when the variable is absent.
        url: process.env["DATABASE_URL"] ?? "",
    },
});
