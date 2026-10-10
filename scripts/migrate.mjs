// Applies drizzle/ migrations before a Vercel production build (run by the `vercel-build` script).
// A failed migration fails the build, so the previous deployment stays live.
// Preview and local builds skip it.
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

if (process.env.VERCEL_ENV !== "production") {
  console.log("migrate: skipped (not a Vercel production build)");
  process.exit(0);
}
if (!process.env.DATABASE_URL) {
  console.error("migrate: DATABASE_URL is not set");
  process.exit(1);
}

await migrate(drizzle(neon(process.env.DATABASE_URL)), { migrationsFolder: "drizzle" });
console.log("migrate: database is up to date");
