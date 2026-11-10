import type { AIGenerate } from '../types.js'
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

const { buildPrompt, cleanOutput, createGenerator, withLengthCheck } = await import('./ai.js')

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

  it('wraps a custom generator with the length check', async () => {
    const generate = vi.fn<AIGenerate>().mockResolvedValue(`${'a'.repeat(120)}.`)
    const wrapped = createGenerator({ generate, provider: 'custom' })!
    expect(await wrapped(request)).toBe(`${'a'.repeat(120)}.`)
    expect(generate).toHaveBeenCalledTimes(1)
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
    expect(title).toContain('between 50 and 60 characters')
    expect(title).toContain('| Bakkerij Jansen')
    expect(title).toContain('"en"')
    expect(buildPrompt(request)).toContain('between 100 and 150 characters')
    expect(buildPrompt(request)).not.toContain('earlier answer')
  })

  it('asks for a correction with the measured length on a retry', () => {
    const retry = buildPrompt({ ...request, kind: 'title', previous: 'Vers brood' })
    expect(retry).toContain('Your earlier answer was "Vers brood". It has 10 characters')
    expect(retry).toContain('too short')
    expect(buildPrompt({ ...request, previous: 'x'.repeat(170) })).toContain('too long')
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

describe('withLengthCheck', () => {
  const title = { ...request, kind: 'title' as const }
  const desc = (n: number) => `${'b'.repeat(n - 1)}.`

  it('accepts a first answer in range without a retry', async () => {
    const generate = vi.fn<AIGenerate>().mockResolvedValue(desc(120))
    expect(await withLengthCheck(generate)(request)).toBe(desc(120))
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('retries a too-short answer with feedback and keeps the answer in range', async () => {
    const generate = vi
      .fn<AIGenerate>()
      .mockResolvedValueOnce(desc(60))
      .mockResolvedValueOnce(desc(110))
    expect(await withLengthCheck(generate)(request)).toBe(desc(110))
    expect(generate).toHaveBeenCalledTimes(2)
    expect(generate.mock.calls[1]![0].previous).toBe(desc(60))
  })

  it('stops after three attempts and returns the closest answer', async () => {
    const generate = vi
      .fn<AIGenerate>()
      .mockResolvedValueOnce(desc(40))
      .mockResolvedValueOnce(desc(90))
      .mockResolvedValueOnce(desc(70))
    expect(await withLengthCheck(generate)(request)).toBe(desc(90))
    expect(generate).toHaveBeenCalledTimes(3)
  })

  it('cuts a too-long answer to the maximum after the retries', async () => {
    const generate = vi.fn<AIGenerate>().mockResolvedValue(desc(200))
    const result = await withLengthCheck(generate)(request)
    expect(result!.length).toBeLessThanOrEqual(150)
    expect(generate).toHaveBeenCalledTimes(3)
  })

  it('adds the site name to a short title when that brings it into range', async () => {
    // 44 characters, like the title the editor flagged as too short.
    const short = 'Ambachtelijk brood uit Utrecht sinds 1952 ok'
    const generate = vi.fn<AIGenerate>().mockResolvedValue(short)
    const result = await withLengthCheck(generate)({ ...title, siteName: 'Jansen' })
    expect(result).toBe(`${short} | Jansen`)
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('returns null when the generator gives nothing', async () => {
    expect(await withLengthCheck(() => Promise.resolve(null))(request)).toBeNull()
  })
})

describe('cleanOutput', () => {
  it('strips labels and quotes', () => {
    expect(cleanOutput('Title: "Vers brood | Bakkerij"', 'title')).toBe('Vers brood | Bakkerij')
    expect(cleanOutput('Meta description: “Lekker brood.”', 'description')).toBe('Lekker brood.')
    expect(cleanOutput("'Brood'", 'title')).toBe('Brood')
  })

  it('keeps only the first line when the model second-guesses itself', () => {
    const reply =
      'Fresh Bread Daily in Utrecht Since 1952 | Bakkerij Jansen\n\nWait, that exceeds 60 characters. Let me count...\n\nFresh Bread Baked Daily Since 1952 | Bakkerij Jansen'
    expect(cleanOutput(reply, 'title')).toBe(
      'Fresh Bread Daily in Utrecht Since 1952 | Bakkerij Jansen',
    )
    expect(cleanOutput('\n\nLekker brood.\nUitleg: dit is 13 tekens.', 'description')).toBe(
      'Lekker brood.',
    )
  })

  it('drops the site suffix of a title that is too long instead of cutting it', () => {
    const long = 'Ambachtelijk vers brood en gebak uit Utrecht sinds 1952 | Bakkerij Jansen'
    expect(cleanOutput(long, 'title')).toBe(
      'Ambachtelijk vers brood en gebak uit Utrecht sinds 1952',
    )
  })

  it('returns null for empty output', () => {
    expect(cleanOutput('   ', 'description')).toBeNull()
    expect(cleanOutput('""', 'title')).toBeNull()
  })
})
