import type { SEOPluginConfig } from '@payloadcms/plugin-seo/types'
import type { RedirectsPluginConfig } from '@payloadcms/plugin-redirects/types'

export type CollectionSeoOptions = {
  /** Field with the document title. Default `title`. */
  titleField?: string
  /** Field with the URL slug. Default `slug`. */
  slugField?: string
  /**
   * Fields whose text is used to write a description when the editor left it empty,
   * e.g. the section builder's blocks field. Default `['layout']`.
   */
  contentFields?: string[]
  /** Path in front of the slug, e.g. `/blog`. Default `''`. */
  pathPrefix?: string
  /** Slug that is served at `/` (only when `pathPrefix` is empty). Default `home`. */
  homeSlug?: string
}

export type AIGenerateRequest = {
  kind: 'description' | 'title'
  /** Language for the output, e.g. `nl`. */
  locale?: string
  /** Plain text taken from the document's content fields. */
  content: string
  siteName: string
  title: string
  /**
   * Set on a retry: an earlier answer whose length was outside the advised range. The
   * generator should write a corrected version.
   */
  previous?: string
}

/** Any text generator. Return `null` to fall back to the rule-based text. */
export type AIGenerate = (request: AIGenerateRequest) => Promise<null | string>

export type AIOptions =
  | {
      /** Defaults to `process.env.ANTHROPIC_API_KEY`. Without a key, AI stays off. */
      apiKey?: string
      /** Default `claude-haiku-5-5`, the cheapest current model. */
      model?: string
      provider: 'anthropic'
    }
  | {
      /** Bring your own provider. */
      generate: AIGenerate
      provider: 'custom'
    }

export type SeoAutopilotConfig = {
  /** Collections that get SEO handling, keyed by slug. `true` uses all defaults. */
  collections: Record<string, CollectionSeoOptions | true>
  /** Turns the plugin off without removing it. */
  disabled?: boolean
  /** Default language for generated text when the request has no locale. Default `nl`. */
  defaultLocale?: string
  /**
   * Optional AI suggestions behind plugin-seo's "Auto-generate" buttons.
   * Off when omitted, `false`, or when no API key is available.
   */
  ai?: AIOptions | false
  /** Extra options for `@payloadcms/plugin-redirects`, or `false` to leave it out. */
  redirects?: false | Partial<RedirectsPluginConfig>
  /** Extra options for `@payloadcms/plugin-seo`, or `false` to leave it out. */
  seo?: false | Partial<SEOPluginConfig>
  /** Shown after page titles and used for `og:site_name`. */
  siteName: string
  /**
   * Public production URL, e.g. `https://www.client.nl`. Used for canonical URLs and the
   * sitemap. Defaults to `NEXT_PUBLIC_SERVER_URL`, then `VERCEL_PROJECT_PRODUCTION_URL`.
   */
  siteUrl?: string
  /** Upload collection for `meta.image`. Default `media`. */
  uploadsCollection?: string
}

export type ResolvedCollectionOptions = Required<CollectionSeoOptions>
