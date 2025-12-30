import type { Config } from "drizzle-kit";

export default {
  schema: "./src/lib/db/tables.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DB_PATH ?? "data/app.sqlite",
  },
} satisfies Config;
