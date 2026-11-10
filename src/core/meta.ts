import type { CollectionSeoOptions, ResolvedCollectionOptions } from '../types.js'

import { extractText, truncate } from './text.js'

/** Google shows roughly 50–60 characters of a title and 150–160 of a description. */
export const TITLE_MAX = 60
export const DESCRIPTION_MAX = 155

export const resolveCollectionOptions = (
  options: CollectionSeoOptions | true | undefined,
): ResolvedCollectionOptions => {
  const value = options === true || !options ? {} : options

  return {
    contentFields: value.contentFields ?? ['layout'],
    homeSlug: value.homeSlug ?? 'home',
    pathPrefix: (value.pathPrefix ?? '').replace(/\/+$/, ''),
    slugField: value.slugField ?? 'slug',
    titleField: value.titleField ?? 'title',
  }
}

type Doc = Record<string, unknown>

const stringField = (doc: Doc, field: string): string => {
  const value = doc?.[field]
  return typeof value === 'string' ? value.trim() : ''
}

/** `Page title | Site name`, dropping the site name when it would not fit. */
export const fallbackTitle = (
  doc: Doc,
  options: ResolvedCollectionOptions,
  siteName: string,
): string => {
  const title = stringField(doc, options.titleField)

  if (!title || title.toLowerCase() === siteName.toLowerCase()) {
    return truncate(siteName, TITLE_MAX)
  }

  const full = `${title} | ${siteName}`

  return full.length <= TITLE_MAX ? full : truncate(title, TITLE_MAX)
}

/** The page's own copy, cut to a description length. Empty when the page has no text yet. */
export const contentText = (doc: Doc, options: ResolvedCollectionOptions): string =>
  extractText(options.contentFields.map((field) => doc?.[field]))

export const fallbackDescription = (doc: Doc, options: ResolvedCollectionOptions): string =>
  truncate(contentText(doc, options), DESCRIPTION_MAX)

/** Public path of a document, e.g. `/`, `/over-ons` or `/blog/my-post`. */
export const docPath = (doc: Doc, options: ResolvedCollectionOptions): null | string => {
  const slug = stringField(doc, options.slugField).replace(/^\/+|\/+$/g, '')

  if (!slug) {
    return null
  }

  if (!options.pathPrefix && slug === options.homeSlug) {
    return '/'
  }

  return `${options.pathPrefix}/${slug}`
}

type MetaGroup = { description?: null | string; image?: unknown; title?: null | string }

/** Editor-entered meta first, generated fallback second. */
export const resolveMeta = (
  doc: Doc,
  options: ResolvedCollectionOptions,
  siteName: string,
): { description: string; title: string } => {
  const meta = (doc?.meta ?? {}) as MetaGroup

  return {
    description: meta.description?.trim() || fallbackDescription(doc, options),
    title: meta.title?.trim() || fallbackTitle(doc, options, siteName),
  }
}
