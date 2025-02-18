/**
 * This script generates variations of the templates into the `templates` directory.
 *
 * How to use:
 *
 * pnpm run script:gen-templates
 *
 * NOTE: You will likely have to commit by using the `--no-verify` flag to avoid the repo linting
 *       There is no way currently to have lint-staged ignore the templates directory.
 */

import chalk from 'chalk'
import { execSync } from 'child_process'
import { configurePayloadConfig } from 'create-payload-app/lib/configure-payload-config.js'
import { copyRecursiveSync } from 'create-payload-app/utils/copy-recursive-sync.js'
import minimist from 'minimist'
import * as fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'path'

import type { DbType, StorageAdapterType } from '../packages/create-payload-app/src/types.js'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

type TemplateVariations = {
  /** package.json name */
  name: string
  /** Base template to copy from */
  base?: string
  /** Directory in templates dir */
  dirname: string
  db: DbType
  storage: StorageAdapterType
  sharp: boolean
  vercelDeployButtonLink?: string
  envNames?: {
    dbUri: string
  }
  /**
   * @default false
   */
  skipReadme?: boolean
  skipConfig?: boolean
  /**
   * @default false
   */
  skipDockerCompose?: boolean
  configureConfig?: boolean
  generateLockfile?: boolean
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

async function main() {
  const args = minimist(process.argv.slice(2))
  const template = args['template'] // template directory name
  const templatesDir = path.resolve(dirname, '../templates')

  const templateRepoUrlBase = `https://github.com/payloadcms/payload/tree/main/templates`

  let variations: TemplateVariations[] = [
    {
      name: 'payload-vercel-postgres-template',
      dirname: 'with-vercel-postgres',
      db: 'vercel-postgres',
      storage: 'vercelBlobStorage',
      sharp: false,
      vercelDeployButtonLink:
        `https://vercel.com/new/clone?repository-url=` +
        encodeURI(
          `${templateRepoUrlBase}/with-vercel-postgres` +
            '&project-name=payload-project' +
            '&env=PAYLOAD_SECRET' +
            '&build-command=pnpm run ci' +
            '&stores=[{"type":"postgres"},{"type":"blob"}]', // Postgres and Vercel Blob Storage
        ),
      envNames: {
        // This will replace the process.env.DATABASE_URI to process.env.POSTGRES_URL
        dbUri: 'POSTGRES_URL',
      },
    },
    {
      name: 'payload-vercel-website-template',
      base: 'website', // This is the base template to copy from
      dirname: 'with-vercel-website',
      db: 'vercel-postgres',
      storage: 'vercelBlobStorage',
      sharp: true,
      vercelDeployButtonLink:
        `https://vercel.com/new/clone?repository-url=` +
        encodeURI(
          `${templateRepoUrlBase}/with-vercel-website` +
            '&project-name=payload-project' +
            '&env=PAYLOAD_SECRET%2CCRON_SECRET' +
            '&build-command=pnpm run ci' +
            '&stores=[{"type":"postgres"},{"type":"blob"}]', // Postgres and Vercel Blob Storage
        ),
      envNames: {
        // This will replace the process.env.DATABASE_URI to process.env.POSTGRES_URL
        dbUri: 'POSTGRES_URL',
      },
      skipReadme: true,
      skipDockerCompose: true,
    },
    {
      name: 'payload-postgres-template',
      dirname: 'with-postgres',
      db: 'postgres',
      storage: 'localDisk',
      sharp: true,
    },
    {
      name: 'payload-vercel-mongodb-template',
      dirname: 'with-vercel-mongodb',
      db: 'mongodb',
      storage: 'vercelBlobStorage',
      sharp: false,
      vercelDeployButtonLink:
        `https://vercel.com/new/clone?repository-url=` +
        encodeURI(
          `${templateRepoUrlBase}/with-vercel-mongodb` +
            '&project-name=payload-project' +
            '&env=PAYLOAD_SECRET' +
            '&build-command=pnpm run ci' +
            '&stores=[{"type":"blob"}]' + // Vercel Blob Storage
            '&integration-ids=oac_jnzmjqM10gllKmSrG0SGrHOH', // MongoDB Atlas
        ),
      envNames: {
        dbUri: 'MONGODB_URI',
      },
    },
    {
      name: 'blank',
      dirname: 'blank',
      db: 'mongodb',
      generateLockfile: true,
      storage: 'localDisk',
      sharp: true,
      skipConfig: true, // Do not copy the payload.config.ts file from the base template
      // The blank template is used as a base for create-payload-app functionality,
      // so we do not configure the payload.config.ts file, which leaves the placeholder comments.
      configureConfig: false,
    },
  ]

  // If template is set, only generate that template
  if (template) {
    const variation = variations.find((v) => v.dirname === template)
    if (!variation) {
      throw new Error(`Variation not found: ${template}`)
    }
    variations = [variation]
  }

  for (const {
    name,
    base,
    dirname,
    db,
    generateLockfile,
    storage,
    vercelDeployButtonLink,
    envNames,
    sharp,
    configureConfig,
    skipReadme = false,
    skipConfig = false,
    skipDockerCompose = false,
  } of variations) {
    header(`Generating ${name}...`)
    const destDir = path.join(templatesDir, dirname)
    copyRecursiveSync(path.join(templatesDir, base || '_template'), destDir, [
      'node_modules',
      '\\*\\.tgz',
      '.next',
      '.env$',
      'pnpm-lock.yaml',
      ...(skipReadme ? ['README.md'] : []),
      ...(skipDockerCompose ? ['docker-compose.yml'] : []),
      ...(skipConfig ? ['payload.config.ts'] : []),
    ])

    log(`Copied to ${destDir}`)

    if (configureConfig !== false) {
      log('Configuring payload.config.ts')
      const configureArgs = {
        dbType: db,
        packageJsonName: name,
        projectDirOrConfigPath: { projectDir: destDir },
        storageAdapter: storage,
        sharp,
        envNames,
      }
      await configurePayloadConfig(configureArgs)

      log('Configuring .env.example')
      // Replace DATABASE_URI with the correct env name if set
      await writeEnvExample({
        destDir,
        envNames,
        dbType: db,
      })
    }

    if (!skipReadme) {
      await generateReadme({
        destDir,
        data: {
          name,
          description: name, // TODO: Add descriptions
          attributes: { db, storage },
          ...(vercelDeployButtonLink && { vercelDeployButtonLink }),
        },
      })
    }

    if (generateLockfile) {
      log('Generating pnpm-lock.yaml')
      execSyncSafe(`pnpm install --ignore-workspace`, { cwd: destDir })
    } else {
      log('Installing dependencies without generating lockfile')
      execSyncSafe(`pnpm install --ignore-workspace`, { cwd: destDir })
      await fs.rm(`${destDir}/pnpm-lock.yaml`, { force: true })
    }

    // Copy in initial migration if db is postgres. This contains user and media.
    if (db === 'postgres' || db === 'vercel-postgres') {
      // Add "ci" script to package.json
      const packageJsonPath = path.join(destDir, 'package.json')
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'))
      packageJson.scripts = packageJson.scripts || {}
      packageJson.scripts.ci = 'payload migrate && pnpm build'
      await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2))

      const migrationDestDir = path.join(destDir, 'src/migrations')

      // Delete and recreate migrations directory
      await fs.rm(migrationDestDir, { recursive: true, force: true })
      await fs.mkdir(migrationDestDir, { recursive: true })

      log(`Generating initial migrations in ${migrationDestDir}`)

      execSyncSafe(`pnpm run payload migrate:create initial`, {
        cwd: destDir,
        env: {
          ...process.env,
          PAYLOAD_SECRET: 'asecretsolongnotevensantacouldguessit',
          BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_TEST_asdf',
          DATABASE_URI: process.env.POSTGRES_URL || 'postgres://localhost:5432/your-database-name',
        },
      })
    }

    // TODO: Email?

    // TODO: Sharp?

    log(`Done configuring payload config for ${destDir}/src/payload.config.ts`)
  }
  // TODO: Run prettier manually on the generated files, husky blows up
  log('Running prettier on generated files...')
  execSyncSafe(`pnpm prettier --write templates "*.{js,jsx,ts,tsx}"`)

  log('Template generation complete!')
}

async function generateReadme({
  destDir,
  data: { name, description, attributes, vercelDeployButtonLink },
}: {
  destDir: string
  data: {
    name: string
    description: string
    attributes: Pick<TemplateVariations, 'db' | 'storage'>
    vercelDeployButtonLink?: string
  }
}) {
  let header = `# ${name}\n`
  if (vercelDeployButtonLink) {
    header += `\n[![Deploy with Vercel](https://vercel.com/button)](${vercelDeployButtonLink})`
  }

  const readmeContent = `${header}

${description}

## Attributes

- **Database**: ${attributes.db}
- **Storage Adapter**: ${attributes.storage}
`

  const readmePath = path.join(destDir, 'README.md')
  await fs.writeFile(readmePath, readmeContent)
  log('Generated README.md')
}

async function writeEnvExample({
  destDir,
  envNames,
  dbType,
}: {
  destDir: string
  envNames?: TemplateVariations['envNames']
  dbType: DbType
}) {
  const envExamplePath = path.join(destDir, '.env.example')
  const envFileContents = await fs.readFile(envExamplePath, 'utf8')

  const fileContents = envFileContents
    .split('\n')
    .filter((l) => {
      // Remove the unwanted PostgreSQL connection comment for "with-vercel-website"
      if (
        dbType === 'vercel-postgres' &&
        (l.startsWith('# Or use a PG connection string') ||
          l.startsWith('#DATABASE_URI=postgresql://'))
      ) {
        return false // Skip this line
      }
      return true // Keep other lines
    })
    .map((l) => {
      if (l.startsWith('DATABASE_URI')) {
        if (dbType === 'mongodb') {
          l = 'MONGODB_URI=mongodb://127.0.0.1/your-database-name'
        }
        // Use db-appropriate connection string
        if (dbType.includes('postgres')) {
          l = 'DATABASE_URI=postgresql://127.0.0.1:5432/your-database-name'
        }

        // Replace DATABASE_URI with the correct env name if set
        if (envNames?.dbUri) {
          l = l.replace('DATABASE_URI', envNames.dbUri)
        }
      }
      return l
    })
    .filter((l) => l.trim() !== '')
    .join('\n')

  console.log(`Writing to ${envExamplePath}`)
  await fs.writeFile(envExamplePath, fileContents)
}

function header(message: string) {
  console.log(chalk.bold.green(`\n${message}\n`))
}

function log(message: string) {
  console.log(chalk.dim(message))
}
function execSyncSafe(command: string, options?: Parameters<typeof execSync>[1]) {
  try {
    console.log(`Executing: ${command}`)
    execSync(command, { stdio: 'inherit', ...options })
  } catch (error) {
    if (error instanceof Error) {
      const stderr = (error as any).stderr?.toString()
      const stdout = (error as any).stdout?.toString()

      if (stderr && stderr.trim()) {
        console.error('Standard Error:', stderr)
      } else if (stdout && stdout.trim()) {
        console.error('Standard Output (likely contains error details):', stdout)
      } else {
        console.error('An unknown error occurred with no output.')
      }
    } else {
      console.error('An unexpected error occurred:', error)
    }
    throw error
  }
}
