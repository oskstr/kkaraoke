import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import type { kkaraoke } from "../generated/prisma/client.ts";

const connectionString = process.env["DATABASE_URL"];

if (!connectionString) {
    throw new Error(
        "DATABASE_URL is not set. The song list is read at build time, so it must be available to `astro build` too.",
    );
}

const adapter = new PrismaPg({
    connectionString,
    // Without this, an unreachable database leaves the build waiting on the TCP
    // connect timeout (~2 minutes) before reporting anything useful.
    connectionTimeoutMillis: 10_000,
});
const prisma = new PrismaClient({ adapter });

export function getSongs() {
    return prisma.kkaraoke.findMany({
        orderBy: { artist: "asc" },
    });
}

export type Song = kkaraoke;
