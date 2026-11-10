import type { Block } from 'payload'

import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { seoAutopilot } from 'payload-seo-autopilot'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { testEmailAdapter } from './helpers/testEmailAdapter.js'
import { seed } from './seed.js'
import { seoConfig } from './seo.config.js'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

if (!process.env.ROOT_DIR) {
  process.env.ROOT_DIR = dirname
}

const sections: Block[] = [
  {
    fields: [
      { name: 'heading', required: true, type: 'text' },
      { name: 'intro', type: 'textarea' },
      { name: 'buttonLabel', type: 'text' },
      { name: 'buttonHref', type: 'text' },
    ],
    slug: 'hero',
  },
  {
    fields: [
      { name: 'heading', type: 'text' },
      { name: 'body', type: 'richText' },
    ],
    slug: 'text',
  },
]

export default buildConfig({
  admin: {
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [
    {
      access: { read: () => true },
      admin: { useAsTitle: 'title' },
      fields: [
        { name: 'title', required: true, type: 'text' },
        { name: 'slug', index: true, required: true, type: 'text', unique: true },
        { name: 'layout', blocks: sections, type: 'blocks' },
      ],
      slug: 'pages',
      versions: { drafts: true },
    },
    {
      access: { read: () => true },
      admin: { useAsTitle: 'title' },
      fields: [
        { name: 'title', required: true, type: 'text' },
        { name: 'slug', required: true, type: 'text', unique: true },
        { name: 'layout', type: 'richText' },
      ],
      slug: 'posts',
    },
    {
      access: { read: () => true },
      fields: [{ name: 'alt', type: 'text' }],
      slug: 'media',
      upload: {
        staticDir: path.resolve(dirname, 'media'),
      },
    },
  ],
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URL || `file:${path.resolve(dirname, 'dev.db')}` },
  }),
  editor: lexicalEditor(),
  email: testEmailAdapter,
  onInit: async (payload) => {
    await seed(payload)
  },
  plugins: [seoAutopilot(seoConfig)],
  secret: process.env.PAYLOAD_SECRET || 'test-secret_key',
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})
