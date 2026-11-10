import type { Metadata } from 'next'

const text = (value: unknown): string => {
  if (!value) {
    return '—'
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'object' && 'absolute' in value) {
    return String((value as { absolute: unknown }).absolute)
  }
  return JSON.stringify(value)
}

/**
 * Shows what search engines get for this page, so the plugin's output is visible without
 * opening dev tools. Only in this playground; a client site would not render this.
 */
export function SeoPanel({ metadata }: { metadata: Metadata }) {
  const rows: [string, unknown][] = [
    ['title', metadata.title],
    ['description', metadata.description],
    ['canonical', metadata.alternates?.canonical],
    ['og:image', (metadata.openGraph?.images as { url: string }[] | undefined)?.[0]?.url],
    ['robots', metadata.robots ?? 'index, follow'],
  ]

  return (
    <aside aria-label="SEO output" className="seo-panel">
      <h2>What search engines see</h2>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd data-seo={label}>{text(value)}</dd>
          </div>
        ))}
      </dl>
      <p>
        <a href="/sitemap.xml">sitemap.xml</a> · <a href="/robots.txt">robots.txt</a> ·{' '}
        <a href="/admin">admin</a>
      </p>
    </aside>
  )
}
