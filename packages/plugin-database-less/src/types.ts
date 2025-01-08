export interface PluginConfig {
  disabled?: boolean
  externalURL: string
  /** custom fetch */
  fetch?: typeof fetch
}

export interface NextPluginConfig {
  apiRoute?: string
  disabled?: boolean
  externalAdminPath?: string
  externalURL: string
}
