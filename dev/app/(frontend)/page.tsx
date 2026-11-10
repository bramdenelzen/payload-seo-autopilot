import { metadataFor, renderDoc } from '../../lib/docPage.js'

export const dynamic = 'force-dynamic'

export const generateMetadata = () => metadataFor('pages', 'home')

export default function Home() {
  return renderDoc('pages', 'home')
}
