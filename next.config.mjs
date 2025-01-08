import bundleAnalyzer from '@next/bundle-analyzer'
import { withSentryConfig } from '@sentry/nextjs'
import { withPayload } from './packages/next/src/withPayload.js'
import { withDatabaseLess } from '@payloadcms/database-less/withDatabaseLess'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

let config = withBundleAnalyzer(
  withPayload({
    eslint: {
      ignoreDuringBuilds: true,
    },
    typescript: {
      ignoreBuildErrors: true,
    },
    experimental: {
      serverActions: {
        bodySizeLimit: '5mb',
      },
    },
    distDir: process.env.NEXT_DIST_DIR,
    env: {
      PAYLOAD_CORE_DEV: 'true',
      ROOT_DIR: path.resolve(dirname),
    },
    async redirects() {
      return [
        {
          destination: '/admin',
          permanent: false,
          source: '/',
        },
      ]
    },
    images: {
      domains: ['localhost'],
    },
    webpack: (webpackConfig) => {
      webpackConfig.resolve.extensionAlias = {
        '.cjs': ['.cts', '.cjs'],
        '.js': ['.ts', '.tsx', '.js', '.jsx'],
        '.mjs': ['.mts', '.mjs'],
      }

      // Ignore sentry warnings when not wrapped with withSentryConfig
      webpackConfig.ignoreWarnings = [
        ...(webpackConfig.ignoreWarnings ?? []),
        { file: /esm\/platform\/node\/instrumentation.js/ },
        { module: /esm\/platform\/node\/instrumentation.js/ },
      ]

      return webpackConfig
    },
  }),
)

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  config = withSentryConfig(config, {
    telemetry: false,
    tunnelRoute: '/monitoring-tunnel',
  })
}

if (process.env.DATABASE_LESS_MODE === 'true') {
  config = withDatabaseLess(config, {
    externalURL: 'http://localhost:3001',
  })
}

export default config
