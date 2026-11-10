# payload-seo-autopilot

Automatic SEO for Payload CMS sites, made for clients who don't know SEO. Editors only create pages. The plugin fills in what they leave empty.

One plugin wraps the official [`@payloadcms/plugin-seo`](https://payloadcms.com/docs/plugins/seo) and [`@payloadcms/plugin-redirects`](https://payloadcms.com/docs/plugins/redirects) with sensible defaults, and adds Next.js helpers for metadata, `sitemap.xml` and `robots.txt`.

## What it does

| Feature               | What it does                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| SEO tab               | Meta title, description and image on every configured collection (plugin-seo)                                                           |
| Auto-generate buttons | Rule-based title (page title plus site name) and description (taken from the page's sections), or AI suggestions when an API key is set |
| Metadata fallbacks    | `buildMetadata()` uses editor meta when filled in and generated text otherwise, so no page ships without a title or description         |
| Canonical URLs        | Always on the production domain, also on preview deployments                                                                            |
| Sitemap               | `buildSitemap()` lists only published documents, with `lastModified`                                                                    |
| Robots                | `buildRobots()` allows crawling in production and blocks Vercel preview deployments completely                                          |
| Redirects             | The redirects collection (plugin-redirects)                                                                                             |

Planned next: automatic 301s when a slug changes, executing redirects in `proxy`, JSON-LD, an SEO checklist in the editor. See the plan document.

## Install

```bash
pnpm add payload-seo-autopilot @payloadcms/plugin-seo @payloadcms/plugin-redirects
# optional, for AI suggestions:
pnpm add @anthropic-ai/sdk
```

The official plugins are peer dependencies, because they pin `payload` to an exact version. Keep them on the same version as `payload`.

## Configure

```ts
// src/seo.config.ts
import { defineSeoConfig } from 'payload-seo-autopilot'

export const seoConfig = defineSeoConfig({
  siteName: 'Bakkerij Jansen',
  collections: {
    pages: { titleField: 'title', slugField: 'slug', contentFields: ['layout'], homeSlug: 'home' },
  },
  ai: { provider: 'anthropic' }, // off automatically when ANTHROPIC_API_KEY is not set
})
```

```ts
// payload.config.ts
import { seoAutopilot } from 'payload-seo-autopilot'
import { seoConfig } from './seo.config'

export default buildConfig({
  // ...
  plugins: [seoAutopilot(seoConfig)],
})
```

Don't also add `seoPlugin()` or `redirectsPlugin()` yourself. Pass their options through `seo: {...}` and `redirects: {...}`, or switch one off with `seo: false` / `redirects: false`.

### Options

| Option              | Default                                                                 |                                                                                                                                                               |
| ------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `siteName`          | required                                                                | Added after page titles, used as `og:site_name`                                                                                                               |
| `collections`       | required                                                                | Per collection: `titleField` (`title`), `slugField` (`slug`), `contentFields` (`['layout']`), `pathPrefix` (`''`), `homeSlug` (`home`). `true` = all defaults |
| `siteUrl`           | `NEXT_PUBLIC_SERVER_URL`, then `https://$VERCEL_PROJECT_PRODUCTION_URL` | Production origin for canonical URLs and the sitemap                                                                                                          |
| `uploadsCollection` | `media`                                                                 | Upload collection for `meta.image`                                                                                                                            |
| `defaultLocale`     | `nl`                                                                    | Language for AI text when the request has no locale                                                                                                           |
| `ai`                | off                                                                     | `{ provider: 'anthropic', apiKey?, model? }` or `{ provider: 'custom', generate }`                                                                            |
| `seo` / `redirects` | `{}`                                                                    | Extra options for the wrapped plugins, or `false`                                                                                                             |
| `disabled`          | `false`                                                                 | Turns the plugin off                                                                                                                                          |

### AI suggestions

AI only runs when an editor clicks **Auto-generate** next to the meta title or description. Nothing is generated or saved on its own, so the editor always sees the text first.

- **Off** when `ai` is not set, set to `false`, or when no API key is found. The buttons then give the rule-based text. Payload logs one line at startup when AI is configured but has no key.
- **Anthropic**: reads `ANTHROPIC_API_KEY`. The default model is `claude-haiku-5-5`, the cheapest current model, which is enough for short meta texts. Set `model` to use another one.
- **Custom**: `{ provider: 'custom', generate: async ({ kind, title, content, siteName, locale }) => string | null }` for any other provider.
- **Length check.** Models are bad at counting characters, so the plugin measures every answer against the range plugin-seo marks as good: titles 50–60 characters, descriptions 100–150. A short title first gets " | Site name" when that fits. An answer that is still outside the range goes back to the model with its measured length, at most twice, and the closest answer wins. A text never exceeds the maximum. With a custom provider, `generate` receives `previous` on such a retry.
- If the AI call fails or returns nothing, the rule-based text is used and the error is logged.

## Next.js

```ts
// app/(frontend)/[[...slug]]/page.tsx
import { buildMetadata } from 'payload-seo-autopilot/next'
import { seoConfig } from '@/seo.config'

export async function generateMetadata({ params }) {
  const page = await findPage((await params).slug) // with depth: 1 so meta.image is populated
  return page ? buildMetadata({ collection: 'pages', config: seoConfig, doc: page }) : {}
}
```

```ts
// app/sitemap.ts
import config from '@payload-config'
import { getPayload } from 'payload'
import { buildSitemap } from 'payload-seo-autopilot/next'
import { seoConfig } from '@/seo.config'

export default async function sitemap() {
  return buildSitemap({ config: seoConfig, payload: await getPayload({ config }) })
}
```

```ts
// app/robots.ts
import { buildRobots } from 'payload-seo-autopilot/next'
import { seoConfig } from '@/seo.config'

export default function robots() {
  return buildRobots({ config: seoConfig })
}
```

A deployment is indexable unless `VERCEL_ENV` is set to something other than `production`, or `SEO_NOINDEX=true`. That makes Docker and Render indexable by default.

## Develop

The repository has a playground in `dev/`: a Payload admin plus a small public site that uses the `/next` helpers, the same way a client project would. It imports the plugin straight from `src/`. Only `dist/` is published, so the playground and the tests are never part of the npm package.

```bash
pnpm install
cp dev/.env.example dev/.env   # optional
pnpm dev                       # http://localhost:3000 and /admin (dev@payloadcms.com / test)
```

The seed data shows each behaviour:

- Home has no SEO filled in, so everything is generated from its sections.
- Over ons has editor meta, which wins.
- Geheim is a draft and stays out of the sitemap.
- A blog post lives under `/blog`.

Every page shows a "What search engines see" panel, with links to `/sitemap.xml` and `/robots.txt`.

AI in the playground:

- With `ANTHROPIC_API_KEY` set, the Auto-generate buttons call Claude. This costs money per click.
- With `DEV_FAKE_AI=true`, a fake provider answers instead, which is free.
- With neither, the buttons give the rule-based text.

### Tests

```bash
pnpm typecheck   # package and playground
pnpm test:int    # unit tests (src/**/*.spec.ts) + integration tests against the playground's Payload (dev/int.spec.ts)
pnpm test:e2e    # Playwright against the running playground: public pages, sitemap, robots and the admin SEO tab
pnpm build
```

The integration tests use their own SQLite file (`dev/int-test.db`), so they don't touch your playground data. The end-to-end tests start `pnpm dev` with `DEV_FAKE_AI=true` if no server is running yet.
