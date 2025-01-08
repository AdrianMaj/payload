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

  const { apiRoute = '/api', externalURL } = pluginOptions

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
      source: `${apiRoute}/:path*`,
      destination: `${externalURL}${apiRoute}/:path*`,
    })

    // Can't rewrite server actions because different instances have different Server Action ID
    // rewrites.push({
    //   source: '/admin/:path*',
    //   has: [
    //     {
    //       type: 'header',
    //       key: 'Next-Action',
    //     },
    //   ],
    //   destination: 'http://localhost:3001/admin/:path*',
    // })

    return rewrites
  }

  return config
}
