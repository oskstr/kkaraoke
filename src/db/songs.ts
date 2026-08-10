import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import type { kkaraoke } from "../generated/prisma/client.ts";

const adapter = new PrismaPg({
    connectionString: process.env["DATABASE_URL"],
});
const prisma = new PrismaClient({ adapter });

export function getSongs() {
    return prisma.kkaraoke.findMany({
        orderBy: { artist: "asc" },
    });
}

export type Song = kkaraoke;
