export interface PluginConfig {
  disabled?: boolean
  externalURL: string
  /** custom fetch */
  fetch?: typeof fetch
}

export interface NextPluginConfig {
  adminRoute?: string
  apiRoute?: string
  disabled?: boolean
  externalAdminPath?: string
  externalURL: string
}
