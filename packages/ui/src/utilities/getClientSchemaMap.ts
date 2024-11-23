import type { I18n, I18nClient } from '@payloadcms/translations'
import type { ClientConfig, ClientFieldSchemaMap } from 'payload'

import { cache } from 'react'

import { buildClientFieldSchemaMap } from './buildClientFieldSchemaMap/index.js'

let cachedClientSchemaMap = global._payload_clientSchemaMap

if (!cachedClientSchemaMap) {
  cachedClientSchemaMap = global._payload_clientSchemaMap = null
}

export const getClientSchemaMap = cache(
  (args: {
    collectionSlug?: string
    config: ClientConfig
    globalSlug?: string
    i18n: I18nClient
  }): ClientFieldSchemaMap => {
    const { collectionSlug, config, globalSlug, i18n } = args

    if (!cachedClientSchemaMap || global._payload_doNotCacheClientSchemaMap) {
      cachedClientSchemaMap = new Map()
    }

    let cachedEntityClientFieldMap = cachedClientSchemaMap.get(collectionSlug || globalSlug)

    if (cachedEntityClientFieldMap) {
      return cachedEntityClientFieldMap
    }

    cachedEntityClientFieldMap = new Map()

    const { clientFieldSchemaMap: entityClientFieldMap } = buildClientFieldSchemaMap({
      collectionSlug,
      config,
      globalSlug,
      i18n: i18n as I18n,
    })

    cachedClientSchemaMap.set(collectionSlug || globalSlug, entityClientFieldMap)

    global._payload_clientSchemaMap = cachedClientSchemaMap

    global._payload_doNotCacheClientSchemaMap = false

    return entityClientFieldMap
  },
)
