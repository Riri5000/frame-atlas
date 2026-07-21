import path from "path";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Absolute path keeps the SQLite file resolvable both locally and inside
// Vercel's serverless bundle (where cwd is /var/task and the db ships
// read-only via outputFileTracingIncludes).
const databaseUrl = `file:${path.join(process.cwd(), "data", "atlas.db")}`;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: databaseUrl,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
