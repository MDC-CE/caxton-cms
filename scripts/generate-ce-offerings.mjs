/**
 * Retired. Course rows used to be parsed from a pg_restore SQL script.
 * Caxton now reads the playground catalog over HTTP
 * (GET /api/v2/destiny/catalog) and refreshes it every day at 03:00 America/New_York.
 */
console.error(
  "This script no longer reads a SQL dump. Set CAXTON_CATALOG_TOKEN and let the server poll GET /api/v2/destiny/catalog.",
);
process.exit(1);
