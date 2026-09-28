'use client'

/**
 * ImageInsertDialog — two-step dialog for inserting images into the Tiptap editor.
 *
 * Step 1: choose a source (upload / asset library / URL)
 * Step 2: configure options (float, width, alt, caption, link) and confirm
 */

import React, { useCallback, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AssetPicker } from '@/components/admin/file-explorer/AssetPicker'
import {
  Image as ImageIcon,
  TextAlignLeft,
  TextAlignCenter,
  TextAlignRight,
  AlignCenterVerticalSimple,
  UploadSimple,
  CheckCircle,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import type { ImageFloat, ResizableImageAttrs } from './ResizableImageExtension'
import { useTranslations } from 'next-intl'
import { ServerUploadError, uploadViaServer } from '@/lib/uploads/adminServerUpload'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Props {
  editor: Editor
  open: boolean
  onClose: () => void
}

interface ImageOptions {
  src: string
  alt: string
  caption: string
  showCaption: boolean
  float: ImageFloat
  widthValue: string
  widthUnit: 'percent' | 'px'
  linkHref: string
}

const DEFAULT_OPTIONS: ImageOptions = {
  src: '',
  alt: '',
  caption: '',
  showCaption: false,
  float: 'none',
  widthValue: '100',
  widthUnit: 'percent',
  linkHref: '',
}

// ─── Preview ─────────────────────────────────────────────────────────────────

function ImagePreview({ src, alt }: { src: string; alt: string }) {
  if (!src) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt || 'Preview'}
      className="h-32 w-full rounded-md border border-border object-contain bg-muted"
    />
  )
}

// ─── Upload tab ──────────────────────────────────────────────────────────────

function UploadTab({ onUploaded }: { onUploaded: (url: string) => void }) {
  const tErrors = useTranslations('errors')
  const tToast = useTranslations('admin.toast')
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])
  const inputRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const isUploading = progress !== null && progress < 100

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {

    const file = e.target.files?.[0]
    if (!file) return
    setProgress(0)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new ServerUploadError(tErrors('AUTH_REQUIRED'))

      const data = await uploadViaServer<{ publicUrl: string }>({
        file,
        token: session.access_token,
        t: tErrors,
        onProgress: setProgress,
      })
      setProgress(100)
      onUploaded(data.publicUrl)
      toast.success(tToast('image_uploaded'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setTimeout(() => setProgress(null), 800)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed border-border p-8 text-center">
      <input ref={inputRef} type="file" accept="image/*" className="hidden" aria-hidden="true" onChange={handleFileChange} />
      <ImageIcon size={32} className="text-muted-foreground" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">Drag &amp; drop or click to upload an image</p>
      <Button type="button" variant="outline" size="sm" disabled={isUploading} onClick={() => inputRef.current?.click()} className="gap-1.5">
        {progress === 100
          ? <CheckCircle size={14} className="text-green-500" aria-hidden="true" />
          : <UploadSimple size={14} className={isUploading ? 'animate-bounce' : ''} aria-hidden="true" />}
        {isUploading ? `${progress}%` : 'Choose file'}
      </Button>
      {progress !== null && <Progress value={progress} className="h-1 w-full max-w-xs" aria-label="Upload progress" />}
    </div>
  )
}

// ─── Options step ─────────────────────────────────────────────────────────────

function OptionsStep({
  options,
  onChange,
}: {
  options: ImageOptions
  onChange: (patch: Partial<ImageOptions>) => void
}) {
  return (
    <div className="space-y-4">
      <ImagePreview src={options.src} alt={options.alt} />

      {/* Float / alignment */}
      <div className="space-y-1.5">
        <Label>Alignment / Float</Label>
        <ToggleGroup
          type="single"
          value={options.float}
          onValueChange={(v) => v && onChange({ float: v as ImageFloat })}
          variant="outline"
          className="w-fit"
        >
          <ToggleGroupItem value="left" aria-label="Float left" title="Float left">
            <TextAlignLeft className="w-4 h-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="center" aria-label="Center" title="Center (block)">
            <TextAlignCenter className="w-4 h-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="right" aria-label="Float right" title="Float right">
            <TextAlignRight className="w-4 h-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="none" aria-label="Full width" title="Full width (no float)">
            <AlignCenterVerticalSimple className="w-4 h-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Width */}
      <div className="space-y-1.5">
        <Label htmlFor="img-width">Width</Label>
        <div className="flex gap-2">
          <Input
            id="img-width"
            type="number"
            min={1}
            max={options.widthUnit === 'percent' ? 100 : 2000}
            value={options.widthValue}
            onChange={(e) => onChange({ widthValue: e.target.value })}
            className="w-24"
          />
          <Select value={options.widthUnit} onValueChange={(v) => onChange({ widthUnit: v as 'percent' | 'px' })}>
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percent">%</SelectItem>
              <SelectItem value="px">px</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Alt text */}
      <div className="space-y-1.5">
        <Label htmlFor="img-alt">Alt text</Label>
        <Input id="img-alt" value={options.alt} onChange={(e) => onChange({ alt: e.target.value })} placeholder="Describe the image…" />
      </div>

      {/* Caption */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Switch
            id="img-caption-toggle"
            checked={options.showCaption}
            onCheckedChange={(v) => onChange({ showCaption: v })}
          />
          <Label htmlFor="img-caption-toggle">Show caption</Label>
        </div>
        {options.showCaption && (
          <Input
            value={options.caption}
            onChange={(e) => onChange({ caption: e.target.value })}
            placeholder="Caption text…"
          />
        )}
      </div>

      {/* Link */}
      <div className="space-y-1.5">
        <Label htmlFor="img-link">Link (optional)</Label>
        <Input id="img-link" value={options.linkHref} onChange={(e) => onChange({ linkHref: e.target.value })} placeholder="https://…" />
      </div>
    </div>
  )
}

// ─── Main dialog ──────────────────────────────────────────────────────────────

export function ImageInsertDialog({ editor, open, onClose }: Props) {
  const [step, setStep] = useState<'source' | 'options'>('source')
  const [options, setOptions] = useState<ImageOptions>(DEFAULT_OPTIONS)
  const [assetPickerOpen, setAssetPickerOpen] = useState(false)
  const [urlInput, setUrlInput] = useState('')

  const handleClose = useCallback(() => {
    setStep('source')
    setOptions(DEFAULT_OPTIONS)
    setUrlInput('')
    onClose()
  }, [onClose])

  const advanceToOptions = useCallback((src: string) => {
    setOptions((prev) => ({ ...prev, src }))
    setStep('options')
  }, [])

  const handlePatchOptions = useCallback((patch: Partial<ImageOptions>) => {
    setOptions((prev) => ({ ...prev, ...patch }))
  }, [])

  const handleInsert = useCallback(() => {
    const width = `${options.widthValue}${options.widthUnit === 'percent' ? '%' : 'px'}`
    const attrs: ResizableImageAttrs = {
      src: options.src,
      alt: options.alt || null,
      'data-float': options.float,
      'data-width': width,
      'data-caption': options.showCaption && options.caption ? options.caption : null,
      'data-link-href': options.linkHref || null,
    }
    editor.chain().focus().setResizableImage(attrs).run()
    handleClose()
  }, [editor, options, handleClose])

  return (
    <>
      <Dialog open={open && !assetPickerOpen} onOpenChange={(o) => !o && handleClose()}>
        <DialogContent className="sm:max-w-lg" aria-labelledby="img-dialog-title">
          <DialogHeader>
            <DialogTitle id="img-dialog-title">
              {step === 'source' ? 'Insert Image' : 'Image Options'}
            </DialogTitle>
          </DialogHeader>

          {step === 'source' && (
            <Tabs defaultValue="upload" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="upload" className="flex-1">Upload</TabsTrigger>
                <TabsTrigger value="library" className="flex-1">Asset Library</TabsTrigger>
                <TabsTrigger value="url" className="flex-1">URL</TabsTrigger>
              </TabsList>

              <TabsContent value="upload" className="mt-4">
                <UploadTab onUploaded={advanceToOptions} />
              </TabsContent>

              <TabsContent value="library" className="mt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => setAssetPickerOpen(true)}
                >
                  <ImageIcon size={16} aria-hidden="true" />
                  Open Asset Library
                </Button>
              </TabsContent>

              <TabsContent value="url" className="mt-4 space-y-3">
                <Input
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && urlInput.trim()) advanceToOptions(urlInput.trim())
                  }}
                />
                <Button
                  type="button"
                  className="w-full"
                  disabled={!urlInput.trim()}
                  onClick={() => { if (urlInput.trim()) advanceToOptions(urlInput.trim()) }}
                >
                  Next
                </Button>
              </TabsContent>
            </Tabs>
          )}

          {step === 'options' && (
            <OptionsStep options={options} onChange={handlePatchOptions} />
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={step === 'options' ? () => setStep('source') : handleClose}>
              {step === 'options' ? 'Back' : 'Cancel'}
            </Button>
            {step === 'options' && (
              <Button type="button" onClick={handleInsert} disabled={!options.src}>
                Insert
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AssetPicker
        open={assetPickerOpen}
        onClose={() => setAssetPickerOpen(false)}
        onSelect={(asset) => {
          setAssetPickerOpen(false)
          advanceToOptions(asset.publicUrl)
        }}
        mimeTypeFilter="image/"
      />
    </>
  )
}
