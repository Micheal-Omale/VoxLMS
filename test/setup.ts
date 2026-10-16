process.loadEnvFile(".env.local");

if (process.env.NEON_BRANCH === "production") {
  throw new Error("Refusing to run database tests against the production branch.");
}
