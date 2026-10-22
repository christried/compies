import { defineConfig } from 'drizzle-kit'

// drizzle-kit does not read .env by itself; CI and Vercel set DATABASE_URL directly.
try {
  process.loadEnvFile()
}
catch {
  // no .env file
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
})
