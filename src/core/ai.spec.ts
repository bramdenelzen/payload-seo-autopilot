import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const create = vi.fn()
const constructed: unknown[] = []

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create }
    constructor(options: unknown) {
      constructed.push(options)
    }
  },
}))

const { buildPrompt, cleanOutput, createGenerator } = await import('./ai.js')

const request = {
  content: 'Wij bakken sinds 1952.',
  kind: 'description' as const,
  locale: 'nl',
  siteName: 'Bakkerij Jansen',
  title: 'Home',
}

beforeEach(() => {
  create.mockReset()
  constructed.length = 0
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('createGenerator', () => {
  it('is off without config, with false, or without an API key', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    expect(createGenerator(undefined)).toBeNull()
    expect(createGenerator(false)).toBeNull()
    expect(createGenerator({ provider: 'anthropic' })).toBeNull()
  })

  it('reads the key from the environment', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-env')
    expect(createGenerator({ provider: 'anthropic' })).toBeTypeOf('function')
  })

  it('returns a custom generator as is', () => {
    const generate = vi.fn()
    expect(createGenerator({ generate, provider: 'custom' })).toBe(generate)
  })
})

describe('anthropic provider', () => {
  const textResponse = (text: string) => ({
    content: [{ text, type: 'text' }],
    stop_reason: 'end_turn',
  })

  it('calls Haiku by default with the prompt and low effort', async () => {
    create.mockResolvedValue(textResponse('Ambachtelijk brood uit Utrecht.'))
    const generate = createGenerator({ apiKey: 'sk-test', provider: 'anthropic' })!

    expect(await generate(request)).toBe('Ambachtelijk brood uit Utrecht.')
    expect(constructed).toEqual([{ apiKey: 'sk-test' }])
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ content: buildPrompt(request), role: 'user' }],
        model: 'claude-haiku-5-5',
        output_config: { effort: 'low' },
      }),
    )
  })

  it('uses a configured model and creates the client once', async () => {
    create.mockResolvedValue(textResponse('x y'))
    const generate = createGenerator({
      apiKey: 'k',
      model: 'claude-sonnet-5-5',
      provider: 'anthropic',
    })!
    await generate(request)
    await generate(request)
    expect(constructed).toHaveLength(1)
    expect(create.mock.calls[0][0].model).toBe('claude-sonnet-5-5')
  })

  it('returns null on a refusal, and cleans and limits the text', async () => {
    const generate = createGenerator({ apiKey: 'k', provider: 'anthropic' })!

    create.mockResolvedValue({ content: [], stop_reason: 'refusal' })
    expect(await generate(request)).toBeNull()

    create.mockResolvedValue(textResponse(`"${'Lange titel '.repeat(10)}"`))
    const title = await generate({ ...request, kind: 'title' })
    expect(title!.length).toBeLessThanOrEqual(60)
    expect(title).not.toContain('"')
  })

  it('lets API errors through, so the caller can fall back', async () => {
    create.mockRejectedValue(new Error('529 overloaded'))
    const generate = createGenerator({ apiKey: 'k', provider: 'anthropic' })!
    await expect(generate(request)).rejects.toThrow('overloaded')
  })
})

describe('buildPrompt', () => {
  it('asks for the right kind, length and language', () => {
    const title = buildPrompt({ ...request, kind: 'title', locale: 'en' })
    expect(title).toContain('SEO title')
    expect(title).toContain('at most 60')
    expect(title).toContain('| Bakkerij Jansen')
    expect(title).toContain('"en"')
    expect(buildPrompt(request)).toContain('at most 155')
  })

  it('caps long content and marks missing input', () => {
    const prompt = buildPrompt({ ...request, content: 'x'.repeat(10_000), title: '' })
    expect(prompt.length).toBeLessThan(6500)
    expect(prompt).toContain('Page title: (none)')
    expect(buildPrompt({ ...request, content: '' })).toContain('(no content yet)')
  })

  it('defaults the language to Dutch', () => {
    expect(buildPrompt({ ...request, locale: undefined })).toContain('"nl"')
  })
})

describe('cleanOutput', () => {
  it('strips labels and quotes', () => {
    expect(cleanOutput('Title: "Vers brood | Bakkerij"', 'title')).toBe('Vers brood | Bakkerij')
    expect(cleanOutput('Meta description: “Lekker brood.”', 'description')).toBe('Lekker brood.')
    expect(cleanOutput("'Brood'", 'title')).toBe('Brood')
  })

  it('returns null for empty output', () => {
    expect(cleanOutput('   ', 'description')).toBeNull()
    expect(cleanOutput('""', 'title')).toBeNull()
  })
})
