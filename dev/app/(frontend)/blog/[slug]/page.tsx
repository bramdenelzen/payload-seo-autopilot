import { metadataFor, renderDoc } from '../../../../lib/docPage.js'

export const dynamic = 'force-dynamic'

type Args = { params: Promise<{ slug: string }> }

export const generateMetadata = async ({ params }: Args) =>
  metadataFor('posts', (await params).slug)

export default async function Post({ params }: Args) {
  return renderDoc('posts', (await params).slug)
}
