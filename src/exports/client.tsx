'use client'

import {
  Button,
  toast,
  useConfig,
  useField,
  useFormFields,
  useLocale,
  useTranslation,
} from '@payloadcms/ui'
import { useState } from 'react'

/** Longest side of the copy sent to the AI. Enough to describe an image, and cheap. */
const MAX_SIDE = 1024

const labels = {
  en: {
    button: 'Generate alt text',
    busy: 'Generating…',
    failed: 'Could not generate alt text.',
    noImage: 'Choose an image first.',
    notImage: 'Alt text can only be generated for images.',
  },
  nl: {
    button: 'Alt-tekst genereren',
    busy: 'Bezig…',
    failed: 'Alt-tekst genereren is mislukt.',
    noImage: 'Kies eerst een afbeelding.',
    notImage: 'Alt-tekst kan alleen voor afbeeldingen worden gegenereerd.',
  },
}

const loadImage = async (
  blob: Blob,
): Promise<CanvasImageSource & { height: number; width: number }> => {
  try {
    return await createImageBitmap(blob)
  } catch {
    // SVG and a few other formats only load through an <img>.
    const url = URL.createObjectURL(blob)
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      return img
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

/** Scales the image down to `MAX_SIDE` and returns it as base64 JPEG. */
export const toScaledJpeg = async (blob: Blob): Promise<string> => {
  const image = await loadImage(blob)
  const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))
  const context = canvas.getContext('2d')!
  // JPEG has no transparency: a white background keeps transparent logos readable.
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
  return dataUrl.slice(dataUrl.indexOf(',') + 1)
}

type Props = { enabled: boolean; endpoint: string; fieldName: string }

/**
 * Shown under the alt field of the upload collection. Works before the upload is saved: it
 * reads the chosen file from the form, scales it down in the browser and asks the server
 * for a suggestion. The editor can still change the text before saving.
 */
export const GenerateAltButton = ({ enabled, endpoint, fieldName }: Props) => {
  const { config } = useConfig()
  const { i18n } = useTranslation()
  const locale = useLocale()
  const { setValue } = useField<string>({ path: fieldName })
  const file = useFormFields(([fields]) => fields.file?.value)
  const url = useFormFields(([fields]) => fields.url?.value)
  const filename = useFormFields(([fields]) => fields.filename?.value)
  const [busy, setBusy] = useState(false)

  const t = i18n.language?.startsWith('nl') ? labels.nl : labels.en

  const readImage = async (): Promise<Blob | null> => {
    if (file instanceof File) {
      return file
    }
    if (typeof url === 'string' && url) {
      const response = await fetch(url, { credentials: 'include' })
      return response.ok ? response.blob() : null
    }
    return null
  }

  const generate = async () => {
    setBusy(true)
    try {
      const blob = await readImage()
      if (!blob) {
        toast.error(t.noImage)
        return
      }
      if (!blob.type.startsWith('image/')) {
        toast.error(t.notImage)
        return
      }

      const response = await fetch(`${config.serverURL ?? ''}${config.routes.api}${endpoint}`, {
        body: JSON.stringify({
          filename:
            file instanceof File ? file.name : typeof filename === 'string' ? filename : undefined,
          image: await toScaledJpeg(blob),
          locale: locale?.code,
          mediaType: 'image/jpeg',
        }),
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const result = (await response.json().catch(() => null)) as { alt?: null | string } | null

      if (!response.ok || !result?.alt) {
        toast.error(t.failed)
        return
      }
      setValue(result.alt)
    } catch {
      toast.error(t.failed)
    } finally {
      setBusy(false)
    }
  }

  if (!enabled) {
    return null
  }

  return (
    <div style={{ marginTop: 'calc(var(--base) / 2)' }}>
      <Button
        buttonStyle="secondary"
        disabled={busy}
        margin={false}
        onClick={() => void generate()}
        size="small"
        type="button"
      >
        {busy ? t.busy : t.button}
      </Button>
    </div>
  )
}
