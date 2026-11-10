/** Public production origin without trailing slash, or `null` when it cannot be known. */
export const resolveSiteUrl = (explicit?: string): null | string => {
  const raw =
    explicit ||
    process.env.NEXT_PUBLIC_SERVER_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : '')

  return raw ? raw.replace(/\/+$/, '') : null
}

/**
 * Whether this deployment should be indexed. Vercel preview and development deployments
 * are not; everything else (Vercel production, Docker, Render) is, unless `SEO_NOINDEX=true`.
 */
export const isIndexable = (): boolean => {
  if (process.env.SEO_NOINDEX === 'true') {
    return false
  }
  const vercelEnv = process.env.VERCEL_ENV
  return !vercelEnv || vercelEnv === 'production'
}

export const absoluteUrl = (siteUrl: null | string, path: string): string =>
  siteUrl ? `${siteUrl}${path === '/' ? '' : path}` : path
