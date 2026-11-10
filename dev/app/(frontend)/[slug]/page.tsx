import { redirect } from 'next/navigation.js'

import { metadataFor, renderDoc } from '../../../lib/docPage.js'

export const dynamic = 'force-dynamic'

type Args = { params: Promise<{ slug: string }> }

export const generateMetadata = async ({ params }: Args) =>
  metadataFor('pages', (await params).slug)

export default async function Page({ params }: Args) {
  const { slug } = await params
  if (slug === 'home') {
    redirect('/')
  }
  return renderDoc('pages', slug)
}
