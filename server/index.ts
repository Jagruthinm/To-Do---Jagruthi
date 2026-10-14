// Load .env FIRST — must be before any dynamic import that reads process.env.
// Static imports are hoisted in ESM, so we use dynamic imports below instead.
try { process.loadEnvFile('.env') } catch { /* missing in prod is fine */ }

const { runMigrations } = await import('../db/migrate.js')
const { app } = await import('./app.js')

runMigrations()

const { startNotificationScheduler, stopNotificationScheduler } = await import('./lib/notificationScheduler.js')
startNotificationScheduler()

const PORT = parseInt(process.env.SERVER_PORT ?? '3001', 10)
const server = app.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}`))

function shutdown() {
  stopNotificationScheduler()
  server.close(() => process.exit(0))
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
