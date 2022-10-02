import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export function getSongs() {
    return prisma.kkaraoke.findMany({
        orderBy: { artist: "asc" },
    });
}
