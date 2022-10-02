import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export function getSongs() {
    return prisma.kkaraoke.findMany({
        orderBy: { artist: "asc" },
    });
}

type Songs = typeof getSongs extends () => Promise<infer T> ? T : never;
export type Song = Songs[number];
