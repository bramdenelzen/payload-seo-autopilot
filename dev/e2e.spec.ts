import { expect, test } from '@playwright/test'

import { devUser } from './helpers/credentials.js'

test.describe('public site', () => {
  test('home page gets generated title, description and canonical', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle('Home | Bakkerij Jansen')
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      /^Vers brood, elke ochtend\. Ambachtelijk gebakken in Utrecht/,
    )
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'http://localhost:3000',
    )
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
      'content',
      'Bakkerij Jansen',
    )
    await expect(page.locator('[data-seo="title"]')).toHaveText('Home | Bakkerij Jansen')
  })

  test('editor meta wins over generated text', async ({ page }) => {
    await page.goto('/over-ons')
    await expect(page).toHaveTitle('Over de bakkerij')
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      'Leer de familie achter Bakkerij Jansen kennen.',
    )
  })

  test('blog posts use the /blog prefix in their canonical URL', async ({ page }) => {
    await page.goto('/blog/zuurdesem')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'http://localhost:3000/blog/zuurdesem',
    )
  })

  test('sitemap.xml lists published content only', async ({ request }) => {
    const xml = await (await request.get('/sitemap.xml')).text()
    expect(xml).toContain('<loc>http://localhost:3000</loc>')
    expect(xml).toContain('<loc>http://localhost:3000/over-ons</loc>')
    expect(xml).toContain('<loc>http://localhost:3000/blog/zuurdesem</loc>')
    expect(xml).not.toContain('geheim')
  })

  test('robots.txt allows crawling and links the sitemap', async ({ request }) => {
    const text = await (await request.get('/robots.txt')).text()
    expect(text).toContain('Allow: /')
    expect(text).toContain('Disallow: /admin')
    expect(text).toContain('Sitemap: http://localhost:3000/sitemap.xml')
  })
})

test.describe('admin', () => {
  test.use({ viewport: { height: 900, width: 1440 } })

  test('the SEO tab fills in a title with Auto-generate', async ({ page }) => {
    await page.goto('/admin')
    await page.fill('#field-email', devUser.email)
    await page.fill('#field-password', devUser.password)
    await page.click('.form-submit button')
    // The first visit compiles the dashboard in dev mode, which can take a while.
    await expect(page).toHaveTitle(/Dashboard/, { timeout: 90_000 })

    await page.goto('/admin/collections/pages')
    await page.getByRole('link', { name: 'Home' }).first().click()
    await page.getByRole('button', { name: 'SEO' }).click()

    const title = page.locator('#field-meta__title')
    await expect(title).toHaveValue('')

    // The dev server runs with DEV_FAKE_AI=true, so the fake AI provider answers.
    // The SEO tab has one Auto-generate button per field: title first, then description.
    const generate = page.getByRole('button', { name: 'Auto-generate' })
    await generate.nth(0).click()
    await expect(title).toHaveValue('AI: Home | Bakkerij Jansen')

    const description = page.locator('#field-meta__description')
    await generate.nth(1).click()
    await expect(description).toHaveValue('AI description for Home.')
  })
})
