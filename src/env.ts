// Loads .env into process.env (existing variables win). Import first in each entry point.
try {
  process.loadEnvFile();
} catch {
  // No .env file: rely on the real environment.
}
