// @ts-check

/**
 * @param {import("next").NextConfig} config
 * @param {import("./types.js").NextPluginConfig} pluginOptions
 */
export const withDatabaseLess = (config, pluginOptions) => {
  if (pluginOptions.disabled) {
    return config
  }

  const incomingRewrites = config.rewrites

  const { adminRoute = '/admin', apiRoute = '/api', externalURL } = pluginOptions

  config.rewrites = async () => {
    /** @type {Awaited<ReturnType<NonNullable<import("next").NextConfig['rewrites']>>>} */
    let rewrites = []

    if (incomingRewrites) {
      let result = await incomingRewrites()

      if (Array.isArray(result)) {
        rewrites = [...result]
      }
    }

    // TODO use real vars

    rewrites.push({
      source: '/api/:path*',
      destination: 'http://localhost:3001/api/:path*',
    })

    rewrites.push({
      source: '/admin/:path*',
      has: [
        {
          type: 'header',
          key: 'Next-Action',
        },
      ],
      destination: 'http://localhost:3001/admin/:path*',
    })

    return rewrites
  }

  return config
}
