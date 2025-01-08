import nextEnvImport from '@next/env'
import chalk from 'chalk'
import { createServer } from 'http'
import minimist from 'minimist'
import nextImport from 'next'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import open from 'open'
import { loadEnv } from 'payload/node'
import { parse } from 'url'

import { getNextRootDir } from './helpers/getNextRootDir.js'
import startMemoryDB from './helpers/startMemoryDB.js'
import { runInit } from './runInit.js'
import { child, safelyRunScriptFunction } from './safelyRunScript.js'
import { createTestHooks } from './testHooks.js'

const prod = process.argv.includes('--prod')
if (prod) {
  process.argv = process.argv.filter((arg) => arg !== '--prod')
  process.env.PAYLOAD_TEST_PROD = 'true'
}

const shouldStartMemoryDB =
  process.argv.includes('--start-memory-db') || process.env.START_MEMORY_DB === 'true'
if (shouldStartMemoryDB) {
  process.argv = process.argv.filter((arg) => arg !== '--start-memory-db')
  process.env.START_MEMORY_DB = 'true'
}

loadEnv()

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const {
  _: [testSuiteArg],
  ...args
} = minimist(process.argv.slice(2))

if (!fs.existsSync(path.resolve(dirname, testSuiteArg))) {
  console.log(chalk.red(`ERROR: The test folder "${testSuiteArg}" does not exist`))
  process.exit(0)
}

if (args.turbo === true) {
  process.env.TURBOPACK = '1'
}

if (process.env.DISABLE_TEST_HOOKS !== 'true') {
  const { beforeTest } = await createTestHooks(testSuiteArg)
  await beforeTest()
}

const { rootDir, adminRoute } = getNextRootDir(testSuiteArg)

if (process.env.DISABLE_TEST_HOOKS !== 'true') {
  await safelyRunScriptFunction(runInit, 4000, testSuiteArg, true)
}

if (shouldStartMemoryDB) {
  await startMemoryDB()
}

// This is needed to forward the environment variables to the next process that were created after loadEnv()
// for example process.env.MONGODB_MEMORY_SERVER_URI otherwise app.prepare() will clear them
nextEnvImport.updateInitialEnv(process.env)

// Open the admin if the -o flag is passed
if (args.o) {
  await open(`http://localhost:3000${adminRoute}`)
}

let defaultPort = 3000
if (testSuiteArg === 'plugin-database-less' && process.env.DATABASE_LESS_MODE !== 'true') {
  defaultPort = 3001

  console.log('Spawning db-less instance')
  const databaseLessInstance = spawn('pnpm', ['dev', 'plugin-database-less', '--o'], {
    env: {
      ...process.env,
      DATABASE_LESS_MODE: 'true',
      NODE_ENV: 'development',
      WRITE_DB_ADAPTER: 'false',
      DISABLE_TEST_HOOKS: 'true',
      // Change .next dir for this process to avoid overlap
      NEXT_DIST_DIR: './test/plugin-database-less/.db-less-next',
    },
    cwd: process.cwd(),
  })

  databaseLessInstance.stdout.on('data', (data) => {
    console.log(chalk.gray(`DB-LESS-INSTANCE [LOG]: ${data}`))
  })

  databaseLessInstance.stderr.on('data', (data) => {
    console.error(chalk.gray(`DB-LESS-INSTANCE [ERR]: ${data}`))
  })

  databaseLessInstance.on('close', (code) => {
    console.log(`DB-LESS-INSTANCE exited with code ${code}`)
  })
}

const port = process.env.PORT ? Number(process.env.PORT) : defaultPort

// @ts-expect-error the same as in test/helpers/initPayloadE2E.ts
const app = nextImport({
  dev: true,
  hostname: 'localhost',
  port,
  dir: rootDir,
})

const handle = app.getRequestHandler()

let resolveServer

const serverPromise = new Promise((res) => (resolveServer = res))

void app.prepare().then(() => {
  createServer(async (req, res) => {
    const parsedUrl = parse(req.url, true)
    await handle(req, res, parsedUrl)
  }).listen(port, () => {
    resolveServer()
  })
})

await serverPromise
process.env.PAYLOAD_DROP_DATABASE = process.env.PAYLOAD_DROP_DATABASE === 'false' ? 'false' : 'true'

// fetch the admin url to force a render
void fetch(`http://localhost:${port}${adminRoute}`)
void fetch(`http://localhost:${port}/api/access`)
// This ensures that the next-server process is killed when this process is killed and doesn't linger around.
process.on('SIGINT', () => {
  if (child) {
    child.kill('SIGINT')
  }
  process.exit(0)
})
process.on('SIGTERM', () => {
  if (child) {
    child.kill('SIGINT')
  }
  process.exit(0) // Exit the parent process
})
