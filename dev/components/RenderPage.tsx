import { RichText } from '@payloadcms/richtext-lexical/react'

type Section = Record<string, unknown> & { blockType: string; id?: string }

export function RenderPage({ doc: page }: { doc: object }) {
  const doc = page as Record<string, unknown>
  const layout = doc.layout

  return (
    <article>
      <h1>{String(doc.title)}</h1>
      {Array.isArray(layout) ? (
        (layout as Section[]).map((section, index) => (
          <section key={section.id ?? index}>
            {section.blockType === 'hero' ? (
              <>
                <h2>{String(section.heading ?? '')}</h2>
                {section.intro ? <p>{String(section.intro)}</p> : null}
                {section.buttonLabel ? (
                  <a href={String(section.buttonHref ?? '#')}>{String(section.buttonLabel)}</a>
                ) : null}
              </>
            ) : (
              <>
                {section.heading ? <h2>{String(section.heading)}</h2> : null}
                {section.body ? <RichText data={section.body as never} /> : null}
              </>
            )}
          </section>
        ))
      ) : layout ? (
        <RichText data={layout as never} />
      ) : null}
    </article>
  )
}
