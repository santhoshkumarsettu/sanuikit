import { parseApiEnvironment } from '@vstudio/config'
import { prisma } from '@vstudio/database/tenant'
import { buildApp } from './app.js'
import { closeAssetQueue, startAssetWorker } from './modules/layouts/asset-jobs.js'
import { closeEventPublisher } from './modules/realtime/bus.js'

const env = parseApiEnvironment()
const app = await buildApp()

async function shutdown(signal: string) {
  app.log.info({ signal }, 'Shutting down VStudio API')
  await app.close(); await closeAssetQueue(); await closeEventPublisher(); await prisma.$disconnect(); process.exit(0)
}
process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))

try { await app.listen({ host: env.HOST, port: env.PORT }); await startAssetWorker() }
catch (error) { app.log.fatal({ err: error }, 'Unable to start VStudio API'); await closeAssetQueue(); await closeEventPublisher(); await prisma.$disconnect(); process.exit(1) }
