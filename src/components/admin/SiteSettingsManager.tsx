'use client'

import { useTranslations } from 'next-intl'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { useForm, Controller, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ArrowUp, ArrowDown, Plus, Trash, Globe,
} from '@phosphor-icons/react'
import { SOCIAL_ICON_MAP, SOCIAL_ICON_OPTIONS } from '@/config/socialIcons'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DEFAULT_SECTION_ORDER } from '@/config/sections'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { TiptapEditor } from '@/components/admin/TiptapEditor'
import type { SiteSettings, HomepageSection } from '@/types'

const RolesManager = lazy(() =>
  import('@/components/admin/RolesManager').then((m) => ({ default: m.RolesManager })),
)
import type { AdminPanelProps } from '@/lib/component-contracts'

// ---------------------------------------------------------------------------
// Homepage section ordering
// ---------------------------------------------------------------------------

const HOMEPAGE_SECTION_LABELS: Record<HomepageSection, string> = {
  releases: 'Releases',
  spotify: 'Spotify Player',
  videos: 'Videos',
  concerts: 'Concerts',
  news: 'News',
  newsletter: 'Newsletter',
}

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const schema = z.object({
  labelName: z.string().min(1, 'Label name is required'),
  labelShortName: z.string().optional().default(''),
  labelTagline: z.string().min(1, 'Tagline is required'),
  contactEmail: z.string().email('Must be a valid email'),
  privacyPolicyUrl: z.string().min(1, 'Privacy policy URL or path is required'),
  termsUrl: z.string().min(1, 'Terms URL or path is required'),
  instagramUrl: z.string().url('Must be a valid URL').or(z.literal('')),
  youtubeUrl: z.string().url('Must be a valid URL').or(z.literal('')),
  spotifyUrl: z.string().url('Must be a valid URL').or(z.literal('')),
  spotifyPlaylistUri: z.string().min(1, 'Spotify playlist URI is required'),
  spotifyPlaylists: z.array(
    z.object({
      label: z.string().min(1, 'Label required'),
      uri: z.string().min(1, 'URI required'),
      theme: z.enum(['dark', 'light']).optional().default('dark'),
      accentColor: z.string().optional().default(''),
    }),
  ).default([]).refine(
    (entries) => new Set(entries.map((entry) => entry.uri.trim())).size === entries.length,
    { message: 'Playlist URIs must be unique' },
  ),
  heroBadge: z.string().min(1, 'Hero badge text is required'),
  heroNewsBadge: z.string().optional().default('📰 News'),
  heroDescription: z.string().min(1, 'Hero description is required'),
  heroContentType: z.enum(['release', 'news']).default('release'),
  heroFeaturedId: z.string().optional().default(''),
  heroCustomBgUrl: z.string().url('Must be a valid URL').or(z.literal('')),
  heroDefaultPrimaryBtnLabel: z.string().optional().default(''),
  heroDefaultSecondaryBtnLabel: z.string().optional().default(''),
  seoTitle: z.string().min(1, 'SEO title is required'),
  seoDescription: z.string().min(1, 'SEO description is required'),
  ogTitle: z.string().min(1, 'OG title is required'),
  ogDescription: z.string().min(1, 'OG description is required'),
  impressumCompanyName: z.string().min(1, 'Company name is required'),
  impressumLegalForm: z.string().optional().default(''),
  impressumRepresentative: z.string().optional().default(''),
  impressumAddress: z.string().optional().default(''),
  impressumVatId: z.string().optional().default(''),
  impressumRegisterCourt: z.string().optional().default(''),
  impressumRegisterNumber: z.string().optional().default(''),
  impressumPhone: z.string().optional().default(''),
  impressumEmail: z.string().email('Must be a valid email').or(z.literal('')),
  datenschutzContent: z.string().optional().default(''),
  datenschutzContentEn: z.string().optional().default(''),
  agbContent: z.string().optional().default(''),
  agbContentEn: z.string().optional().default(''),
  portalTermsVersion: z.string().optional().default(''),
  labelBillingStreet: z.string().optional().default(''),
  labelBillingPostalCode: z.string().optional().default(''),
  labelBillingCity: z.string().optional().default(''),
  labelBillingCountry: z.string().optional().default(''),
  consentPlaceholderUrl: z.string().url('Must be a valid URL').or(z.literal('')),
  carouselAutoplayMs: z.number().int().min(0).default(0),
  videosPerPage: z.number().int().min(1).max(50).default(9),
  videosLinkToPage: z.boolean().default(false),
  excludeShortsFromPublic: z.boolean().default(false),
  homepageNewsCount: z.number().int().min(1).max(12).default(3),
  logoUrl: z.string().optional().default(''),
  faviconUrl: z.string().optional().default(''),
  aboutHeadline: z.string().optional().default(''),
  aboutSubheading: z.string().optional().default(''),
  aboutBody: z.string().optional().default(''),
  // Section text overrides
  newsletterHeading: z.string().optional().default(''),
  newsletterDescription: z.string().optional().default(''),
  spotifySectionHeading: z.string().optional().default(''),
  spotifySectionSubheading: z.string().optional().default(''),
  videosSectionHeading: z.string().optional().default(''),
  videosSectionSubheading: z.string().optional().default(''),
  newsSectionHeading: z.string().optional().default(''),
  newsSectionSubheading: z.string().optional().default(''),
  concertsSectionHeading: z.string().optional().default(''),
  concertsSectionSubheading: z.string().optional().default(''),
  releasesSectionHeading: z.string().optional().default(''),
  releasesSectionSubheading: z.string().optional().default(''),
  shopifyStoreUrl: z.string().url('Must be a valid URL').or(z.literal('')),
  submitHubUrl: z.string().url('Must be a valid URL').or(z.literal('')).optional().default(''),
  submitHubLabel: z.string().optional().default(''),
  submitHubDescription: z.string().optional().default(''),
  submitHubSectionHeading: z.string().optional().default(''),
  showAboutInHeader: z.boolean().optional().default(true),
  showAboutInFooter: z.boolean().optional().default(true),
  aboutNavLabel: z.string().optional().default('About'),
  youtubeChannelId: z.string().optional().default(''),
  contactTopics: z.array(
    z.object({
      value: z.string().min(1, 'Value required'),
      label_de: z.string().min(1, 'German label required'),
      label_en: z.string().min(1, 'English label required'),
    }),
  ).default([]),
  customSocialLinks: z.array(
    z.object({
      id: z.string(),
      label: z.string().min(1, 'Label required'),
      url: z.string().url('Must be a valid URL'),
      icon: z.string().min(1, 'Icon required'),
    }),
  ).default([]),
})

type FormData = z.input<typeof schema>

// ---------------------------------------------------------------------------
// Icon map for custom social links — defined in @/config/socialIcons and
// re-exported here for backward compatibility.
// ---------------------------------------------------------------------------

export { SOCIAL_ICON_MAP, SOCIAL_ICON_OPTIONS }

// ---------------------------------------------------------------------------
// Sub-sections
// ---------------------------------------------------------------------------

interface FieldProps {
  id: string
  label: string
  error?: string
  disabled?: boolean
  children: React.ReactNode
}

function Field({ id, label, error, children }: FieldProps) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SiteSettingsManager({ value: settings, onChange: saveSettings, isLoading }: AdminPanelProps<SiteSettings>) {
  const tToast = useTranslations('admin.toast')


  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: settings,
  })
  const { fields, append, remove, move } = useFieldArray({
    control,
    name: 'spotifyPlaylists',
  })
  const { fields: topicFields, append: appendTopic, remove: removeTopic } = useFieldArray({
    control,
    name: 'contactTopics',
  })
  const { fields: socialFields, append: appendSocial, remove: removeSocial, move: moveSocial } = useFieldArray({
    control,
    name: 'customSocialLinks',
  })

  const logoUrl = watch('logoUrl')
  const faviconUrl = watch('faviconUrl')

  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const [isUploadingFavicon, setIsUploadingFavicon] = useState(false)
  const [isUploadingHeroBg, setIsUploadingHeroBg] = useState(false)
  const [activeTab, setActiveTab] = useState('global')
  const logoInputRef = useRef<HTMLInputElement>(null)
  const faviconInputRef = useRef<HTMLInputElement>(null)
  const heroBgInputRef = useRef<HTMLInputElement>(null)
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])

  // Section ordering state (managed outside RHF as it's an array not in the schema)
  const [sectionOrder, setSectionOrder] = useState<HomepageSection[]>(
    () => settings?.homepageSectionOrder ?? DEFAULT_SECTION_ORDER,
  )
  const dragIndexRef = useRef<number | null>(null)

  function moveSectionUp(index: number) {
    if (index === 0) return
    setSectionOrder((prev) => {
      const next = [...prev]
      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
      return next
    })
  }

  function moveSectionDown(index: number) {
    setSectionOrder((prev) => {
      if (index === prev.length - 1) return prev
      const next = [...prev]
      ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
      return next
    })
  }

  function handleDragStart(index: number) {
    dragIndexRef.current = index
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    const from = dragIndexRef.current
    if (from === null || from === index) return
    setSectionOrder((prev) => {
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(index, 0, item)
      return next
    })
    dragIndexRef.current = index
  }

  function handleDragEnd() {
    dragIndexRef.current = null
  }

  async function uploadFile(file: File, fieldName: 'logoUrl' | 'faviconUrl' | 'heroCustomBgUrl', setUploading: (v: boolean) => void) {
    setUploading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')

      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      })
      if (!res.ok) throw new Error(`Upload failed: ${await res.text()}`)
      const json = await res.json() as { publicUrl: string }
      setValue(fieldName, json.publicUrl, { shouldDirty: true })
      toast.success(tToast('file_uploaded_success'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  // Sync form state when settings load from Supabase
  useEffect(() => {
    reset(settings)
    setSectionOrder(settings?.homepageSectionOrder ?? DEFAULT_SECTION_ORDER)
  }, [settings, reset])

  const onSubmit = async (data: FormData) => {

    try {
      // Merge form data with current settings so fields not rendered in this
      // form (featureToggles, rolePermissions) are never silently overwritten.
      await saveSettings({ ...settings, ...data, homepageSectionOrder: sectionOrder } as SiteSettings)
      toast.success(tToast('site_settings_saved'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings')
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="global">Global</TabsTrigger>
          <TabsTrigger value="branding">Logo &amp; Favicon</TabsTrigger>
          <TabsTrigger value="about">About Page</TabsTrigger>
          <TabsTrigger value="social">Social Links</TabsTrigger>
          <TabsTrigger value="homepage">Homepage</TabsTrigger>
          <TabsTrigger value="contact">Contact Form</TabsTrigger>
          <TabsTrigger value="sections">Section Texts</TabsTrigger>
          <TabsTrigger value="hero">Hero Section</TabsTrigger>
          <TabsTrigger value="seo">SEO / Meta</TabsTrigger>
          <TabsTrigger value="legal">Legal / DSGVO</TabsTrigger>
          <TabsTrigger value="roles">Roles &amp; Permissions</TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------------------------ */}
        {/* Global                                                               */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="global">
          <Card>
            <CardHeader>
              <CardTitle>Global Settings</CardTitle>
              <CardDescription>
                Core identity values shown across the entire site (footer, header, etc.)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field id="labelName" label="Label Name *" error={errors.labelName?.message}>
                <Input id="labelName" {...register('labelName')} disabled={isSubmitting} />
              </Field>
              <Field id="labelShortName" label="Short Name (optional)" error={errors.labelShortName?.message}>
                <Input id="labelShortName" {...register('labelShortName')} disabled={isSubmitting} />
                <p className="text-xs text-muted-foreground">
                  Sidebars, PWA, and compact UI. Empty derives from label name.
                </p>
              </Field>

              <Field id="labelTagline" label="Label Tagline *" error={errors.labelTagline?.message}>
                <Input id="labelTagline" {...register('labelTagline')} disabled={isSubmitting} />
              </Field>

              <Field
                id="contactEmail"
                label="Contact Email *"
                error={errors.contactEmail?.message}
              >
                <Input
                  id="contactEmail"
                  type="email"
                  {...register('contactEmail')}
                  disabled={isSubmitting}
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field
                  id="privacyPolicyUrl"
                  label="Privacy Policy URL *"
                  error={errors.privacyPolicyUrl?.message}
                >
                  <Input
                    id="privacyPolicyUrl"
                    {...register('privacyPolicyUrl')}
                    disabled={isSubmitting}
                  />
                </Field>
                <Field id="termsUrl" label="Terms URL *" error={errors.termsUrl?.message}>
                  <Input id="termsUrl" {...register('termsUrl')} disabled={isSubmitting} />
                </Field>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* Branding — Logo & Favicon                                           */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="branding">
          <Card>
            <CardHeader>
              <CardTitle>Logo &amp; Favicon</CardTitle>
              <CardDescription>
                Upload a custom logo (shown in the header and footer) and a favicon (shown in the browser tab).
                Leave blank to fall back to the default static assets.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              {/* Logo */}
              <div className="space-y-3">
                <Label>Label Logo</Label>
                {logoUrl && (
                  <div className="flex items-center gap-4 p-3 bg-muted rounded-lg">
                    <Image src={logoUrl} alt="Current logo" width={200} height={48} className="h-12 w-auto object-contain max-w-[200px]" style={{ width: 'auto' }} unoptimized />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setValue('logoUrl', '', { shouldDirty: true })}
                      disabled={isSubmitting}
                    >
                      Remove
                    </Button>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void uploadFile(file, 'logoUrl', setIsUploadingLogo)
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={isSubmitting || isUploadingLogo}
                  >
                    {isUploadingLogo ? 'Uploading…' : logoUrl ? 'Replace Logo' : 'Upload Logo'}
                  </Button>
                  <span className="text-xs text-muted-foreground">PNG, SVG, or WebP recommended · transparent background preferred</span>
                </div>
                <Input
                  placeholder="Or paste R2 URL directly…"
                  {...register('logoUrl')}
                  disabled={isSubmitting}
                />
              </div>

              {/* Favicon */}
              <div className="space-y-3">
                <Label>Favicon</Label>
                {faviconUrl && (
                  <div className="flex items-center gap-4 p-3 bg-muted rounded-lg">
                    <Image src={faviconUrl} alt="Current favicon" width={32} height={32} className="h-8 w-8 object-contain" unoptimized />
                    <span className="text-sm text-muted-foreground font-mono truncate max-w-xs">{faviconUrl}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setValue('faviconUrl', '', { shouldDirty: true })}
                      disabled={isSubmitting}
                    >
                      Remove
                    </Button>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <input
                    ref={faviconInputRef}
                    type="file"
                    accept="image/x-icon,image/png,image/svg+xml,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void uploadFile(file, 'faviconUrl', setIsUploadingFavicon)
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => faviconInputRef.current?.click()}
                    disabled={isSubmitting || isUploadingFavicon}
                  >
                    {isUploadingFavicon ? 'Uploading…' : faviconUrl ? 'Replace Favicon' : 'Upload Favicon'}
                  </Button>
                  <span className="text-xs text-muted-foreground">ICO or 32×32 PNG recommended</span>
                </div>
                <Input
                  placeholder="Or paste R2 URL directly…"
                  {...register('faviconUrl')}
                  disabled={isSubmitting}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* About Page                                                           */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="about">
          <Card>
            <CardHeader>
              <CardTitle>About Page Content</CardTitle>
              <CardDescription>
                Manage all text shown on <code>/about</code>. Leave headline/subheading blank to use the default i18n values.
                The body supports Markdown (headings, bold, italic, links, lists).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Navigation visibility toggles */}
              <div className="flex flex-col gap-3 pb-2 border-b border-border">
                <div className="flex items-center gap-3">
                  <Controller
                    name="showAboutInHeader"
                    control={control}
                    render={({ field }) => (
                      <Switch
                        id="showAboutInHeader"
                        checked={field.value ?? true}
                        onCheckedChange={field.onChange}
                        disabled={isSubmitting}
                      />
                    )}
                  />
                  <Label htmlFor="showAboutInHeader">Show About in header navigation</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Controller
                    name="showAboutInFooter"
                    control={control}
                    render={({ field }) => (
                      <Switch
                        id="showAboutInFooter"
                        checked={field.value ?? true}
                        onCheckedChange={field.onChange}
                        disabled={isSubmitting}
                      />
                    )}
                  />
                  <Label htmlFor="showAboutInFooter">Show About in footer navigation</Label>
                </div>
                <Field id="aboutNavLabel" label="Navigation label (default: &quot;About&quot;)">
                  <Input
                    id="aboutNavLabel"
                    placeholder="About"
                    {...register('aboutNavLabel')}
                    disabled={isSubmitting}
                  />
                </Field>
              </div>

              <Field id="aboutHeadline" label="Headline (optional — overrides i18n default)">
                <Input
                  id="aboutHeadline"
                  placeholder="e.g. ABOUT DARKTUNES"
                  {...register('aboutHeadline')}
                  disabled={isSubmitting}
                />
              </Field>

              <Field id="aboutSubheading" label="Subheading (optional — overrides i18n default)">
                <Input
                  id="aboutSubheading"
                  placeholder="e.g. The creative force behind the sound"
                  {...register('aboutSubheading')}
                  disabled={isSubmitting}
                />
              </Field>

              <Field id="aboutBody" label="Body Text (Rich Text)">
                <Controller
                  name="aboutBody"
                  control={control}
                  render={({ field }) => (
                    <TiptapEditor
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      disabled={isSubmitting}
                      placeholder="Tell the story of the label — history, mission, team…"
                      grow
                    />
                  )}
                />
              </Field>

              {/* SubmitHub Section */}
              <div className="space-y-4 pt-4 border-t border-border">
                <div>
                  <p className="text-sm font-semibold">SubmitHub Section</p>
                  <p className="text-xs text-muted-foreground">Shown on the About page as a music submission CTA.</p>
                </div>
                <Field id="submitHubUrl" label="SubmitHub Playlister URL" error={errors.submitHubUrl?.message}>
                  <Input
                    id="submitHubUrl"
                    placeholder="https://www.submithub.com/playlister/your-profile"
                    {...register('submitHubUrl')}
                    disabled={isSubmitting}
                  />
                </Field>
                <Field id="submitHubSectionHeading" label="Submit Music — Überschrift (optional, überschreibt i18n-Standard)">
                  <Input
                    id="submitHubSectionHeading"
                    placeholder="Musik einreichen / Submit Your Music"
                    {...register('submitHubSectionHeading')}
                    disabled={isSubmitting}
                  />
                </Field>
                <Field id="submitHubLabel" label="SubmitHub Button Label (optional)" error={errors.submitHubLabel?.message}>
                  <Input
                    id="submitHubLabel"
                    placeholder="Submit Your Music"
                    {...register('submitHubLabel')}
                    disabled={isSubmitting}
                  />
                </Field>
                <Field id="submitHubDescription" label="Submit Music — Beschreibungstext (optional, überschreibt i18n-Standard)" error={errors.submitHubDescription?.message}>
                  <Textarea
                    id="submitHubDescription"
                    placeholder="Du bist Künstler oder Band und möchtest deine Musik vorstellen?…"
                    rows={3}
                    {...register('submitHubDescription')}
                    disabled={isSubmitting}
                  />
                </Field>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* Social Links                                                         */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="social">
          <Card>
            <CardHeader>
              <CardTitle>Social Links</CardTitle>
              <CardDescription>
                URLs shown in the footer social icons. Leave blank to hide an icon.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field
                id="instagramUrl"
                label="Instagram URL"
                error={errors.instagramUrl?.message}
              >
                <Input
                  id="instagramUrl"
                  placeholder="https://instagram.com/..."
                  {...register('instagramUrl')}
                  disabled={isSubmitting}
                />
              </Field>

              <Field id="youtubeUrl" label="YouTube URL" error={errors.youtubeUrl?.message}>
                <Input
                  id="youtubeUrl"
                  placeholder="https://youtube.com/@..."
                  {...register('youtubeUrl')}
                  disabled={isSubmitting}
                />
              </Field>

              <Field id="spotifyUrl" label="Spotify Profile URL" error={errors.spotifyUrl?.message}>
                <Input
                  id="spotifyUrl"
                  placeholder="https://open.spotify.com/user/..."
                  {...register('spotifyUrl')}
                  disabled={isSubmitting}
                />
              </Field>

              <Field id="shopifyStoreUrl" label="Shopify / Merch Store URL" error={errors.shopifyStoreUrl?.message}>
                <Input
                  id="shopifyStoreUrl"
                  placeholder="https://your-store.myshopify.com"
                  {...register('shopifyStoreUrl')}
                  disabled={isSubmitting}
                />
              </Field>

              <Field id="youtubeChannelId" label="YouTube Channel ID" error={errors.youtubeChannelId?.message}>
                <Input
                  id="youtubeChannelId"
                  placeholder="UCxxxxxxxxxxxxxxxxxxxxxxxx"
                  {...register('youtubeChannelId')}
                  disabled={isSubmitting}
                />
              </Field>

              {/* Custom additional social links */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <Label>Additional Social / Web Links</Label>
                    <p className="text-xs text-muted-foreground">
                      Extra links shown in the footer alongside the built-in icons. Choose an icon and provide a URL.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => appendSocial({ id: crypto.randomUUID(), label: '', url: '', icon: 'Globe' })}
                    disabled={isSubmitting}
                  >
                    + Add link
                  </Button>
                </div>

                {socialFields.length === 0 && (
                  <p className="text-xs text-muted-foreground">No additional links configured.</p>
                )}

                <div className="space-y-3">
                  {socialFields.map((field, index) => {
                    const IconPreview = SOCIAL_ICON_MAP[watch(`customSocialLinks.${index}.icon` as const) ?? ''] ?? Globe
                    return (
                      <div key={field.id} className="border rounded-md p-3 space-y-2">
                        <div className="grid gap-2 md:grid-cols-[140px_1fr_1fr] items-start">
                          {/* Icon selector */}
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Icon</Label>
                            <div className="flex items-center gap-2">
                              <IconPreview size={20} weight="fill" aria-hidden="true" />
                              <Controller
                                name={`customSocialLinks.${index}.icon` as const}
                                control={control}
                                render={({ field: f }) => (
                                  <Select value={f.value} onValueChange={f.onChange} disabled={isSubmitting}>
                                    <SelectTrigger className="flex-1">
                                      <SelectValue placeholder="Icon" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {SOCIAL_ICON_OPTIONS.map((name) => (
                                        <SelectItem key={name} value={name}>{name.replace('Logo', '')}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                              />
                            </div>
                          </div>
                          {/* Label */}
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Label (aria)</Label>
                            <Input
                              placeholder="e.g. darkTunes on Bandcamp"
                              {...register(`customSocialLinks.${index}.label` as const)}
                              disabled={isSubmitting}
                            />
                            {errors.customSocialLinks?.[index]?.label?.message && (
                              <p className="text-xs text-destructive">{errors.customSocialLinks[index]?.label?.message}</p>
                            )}
                          </div>
                          {/* URL */}
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">URL</Label>
                            <Input
                              placeholder="https://..."
                              {...register(`customSocialLinks.${index}.url` as const)}
                              disabled={isSubmitting}
                            />
                            {errors.customSocialLinks?.[index]?.url?.message && (
                              <p className="text-xs text-destructive">{errors.customSocialLinks[index]?.url?.message}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button" variant="ghost" size="icon"
                            onClick={() => moveSocial(index, index - 1)}
                            disabled={isSubmitting || index === 0}
                            title="Move up"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </Button>
                          <Button
                            type="button" variant="ghost" size="icon"
                            onClick={() => moveSocial(index, index + 1)}
                            disabled={isSubmitting || index === socialFields.length - 1}
                            title="Move down"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </Button>
                          <Button
                            type="button" variant="ghost" size="sm"
                            onClick={() => removeSocial(index)}
                            disabled={isSubmitting}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* Homepage                                                             */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="homepage">
          <Card>
            <CardHeader>
              <CardTitle>Homepage Content</CardTitle>
              <CardDescription>
                Text and media shown on the public homepage (Spotify player, videos grid).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field
                id="spotifyPlaylistUri"
                label="Spotify Playlist URI *"
                error={errors.spotifyPlaylistUri?.message}
              >
                <Input
                  id="spotifyPlaylistUri"
                  placeholder="e.g. 37i9dQZF1DWWqNV5cS50j6"
                  {...register('spotifyPlaylistUri')}
                  disabled={isSubmitting}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  The playlist ID from the Spotify share link (not the full URL).
                </p>
              </Field>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <Label>Spotify Playlists (Tabs)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ label: '', uri: '', theme: 'dark', accentColor: '' })}
                    disabled={isSubmitting}
                  >
                    + Add playlist
                  </Button>
                </div>

                {fields.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No additional playlists configured. The website will fall back to the “Spotify
                    Playlist URI” field above.
                  </p>
                )}

                <div className="space-y-4">
                  {fields.map((field, index) => (
                    <div key={field.id} className="border rounded-md p-3 space-y-2">
                      <div className="grid gap-2 md:grid-cols-[1fr_1fr] items-start">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Label</Label>
                          <Input
                            placeholder="Darkwave Mix"
                            {...register(`spotifyPlaylists.${index}.label` as const)}
                            disabled={isSubmitting}
                          />
                          {errors.spotifyPlaylists?.[index]?.label?.message && (
                            <p className="text-xs text-destructive">
                              {errors.spotifyPlaylists[index]?.label?.message}
                            </p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">URI / URL</Label>
                          <Input
                            placeholder="spotify:playlist:xxx or share URL"
                            {...register(`spotifyPlaylists.${index}.uri` as const)}
                            disabled={isSubmitting}
                          />
                          {errors.spotifyPlaylists?.[index]?.uri?.message && (
                            <p className="text-xs text-destructive">
                              {errors.spotifyPlaylists[index]?.uri?.message}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="grid gap-2 md:grid-cols-[160px_1fr_auto] items-end">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Player Theme</Label>
                          <Controller
                            name={`spotifyPlaylists.${index}.theme` as const}
                            control={control}
                            render={({ field: f }) => (
                              <Select
                                value={f.value ?? 'dark'}
                                onValueChange={f.onChange}
                                disabled={isSubmitting}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Theme" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="dark">Dark</SelectItem>
                                  <SelectItem value="light">Light</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">
                            Tab Accent Color (optional)
                          </Label>
                          <Controller
                            name={`spotifyPlaylists.${index}.accentColor` as const}
                            control={control}
                            render={({ field: f }) => (
                              <div className="flex items-center gap-2">
                                <input
                                  type="color"
                                  value={f.value || '#7e1e37'}
                                  onChange={(e) => f.onChange(e.target.value)}
                                  disabled={isSubmitting}
                                  className="h-9 w-10 cursor-pointer rounded border border-input bg-background p-1 disabled:opacity-50"
                                  aria-label="Pick accent color"
                                />
                                <Input
                                  placeholder="#7e1e37"
                                  value={f.value ?? ''}
                                  onChange={f.onChange}
                                  disabled={isSubmitting}
                                  className="flex-1"
                                />
                              </div>
                            )}
                          />
                        </div>
                        <div className="flex gap-1 pb-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => move(index, index - 1)}
                            disabled={isSubmitting || index === 0}
                            title="Move up"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => move(index, index + 1)}
                            disabled={isSubmitting || index === fields.length - 1}
                            title="Move down"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => remove(index)}
                            disabled={isSubmitting}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {typeof errors.spotifyPlaylists?.message === 'string' && (
                  <p className="text-xs text-destructive">{errors.spotifyPlaylists.message}</p>
                )}
              </div>

              <Field id="carouselAutoplayMs" label="Carousel Auto-Advance (ms)">
                <Input
                  id="carouselAutoplayMs"
                  type="number"
                  min={0}
                  step={500}
                  {...register('carouselAutoplayMs', { valueAsNumber: true })}
                  disabled={isSubmitting}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Milliseconds between automatic slide advances. 0 = disabled (recommended default).
                  E.g. 5000 = 5 seconds.
                </p>
              </Field>

              <Field id="videosPerPage" label="Videos per page">
                <Input
                  id="videosPerPage"
                  type="number"
                  min={1}
                  max={50}
                  step={1}
                  {...register('videosPerPage', { valueAsNumber: true })}
                  disabled={isSubmitting}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Number of video tiles shown per page on the homepage video grid (e.g. 9 = 3×3).
                </p>
              </Field>

              <Field id="homepageNewsCount" label="News items on homepage">
                <Input
                  id="homepageNewsCount"
                  type="number"
                  min={1}
                  max={12}
                  step={1}
                  {...register('homepageNewsCount', { valueAsNumber: true })}
                  disabled={isSubmitting}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  How many news posts are shown in the news preview section on the homepage (1–12). Default: 3.
                </p>
              </Field>

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="videosLinkToPage">Link videos grid to /videos page</Label>
                  <p className="text-xs text-muted-foreground">
                    Show only the first page on the homepage and add a &quot;View all&quot; link to the full /videos page with search.
                  </p>
                </div>
                <Controller
                  name="videosLinkToPage"
                  control={control}
                  render={({ field }) => (
                    <Switch
                      id="videosLinkToPage"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={isSubmitting}
                    />
                  )}
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="excludeShortsFromPublic">Exclude Shorts from /videos page</Label>
                  <p className="text-xs text-muted-foreground">
                    Hide YouTube Shorts (≤&nbsp;180&nbsp;s or #shorts tag) from the public videos page. Shorts are still visible in the admin.
                  </p>
                </div>
                <Controller
                  name="excludeShortsFromPublic"
                  control={control}
                  render={({ field }) => (
                    <Switch
                      id="excludeShortsFromPublic"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={isSubmitting}
                    />
                  )}
                />
              </div>

              {/* Section order */}
              <div className="space-y-3 pt-2">
                <div className="space-y-1">
                  <Label>Section Order</Label>
                  <p className="text-xs text-muted-foreground">
                    Drag rows or use the arrows to set the display order of homepage sections. The Hero is always at the top.
                  </p>
                </div>
                <div className="space-y-1">
                  {sectionOrder.map((section, index) => (
                    <div
                      key={section}
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragEnd={handleDragEnd}
                      className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 cursor-grab active:cursor-grabbing select-none"
                    >
                      <span className="text-muted-foreground text-sm w-5 shrink-0">{index + 1}.</span>
                      <span className="flex-1 text-sm font-medium">{HOMEPAGE_SECTION_LABELS[section]}</span>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => moveSectionUp(index)}
                          disabled={isSubmitting || index === 0}
                          title="Move up"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => moveSectionDown(index)}
                          disabled={isSubmitting || index === sectionOrder.length - 1}
                          title="Move down"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* Contact Form                                                         */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="contact">
          <Card>
            <CardHeader>
              <CardTitle>Contact Form Topics</CardTitle>
              <CardDescription>
                Define the topics shown in the contact form dropdown. Each topic needs a unique
                internal value and bilingual labels (DE / EN). Leave the list empty to use the
                four built-in topics (Label, Shop, Booking, Other).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {topicFields.map((field, index) => (
                  <div key={field.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-start">
                    <div className="space-y-1">
                      {index === 0 && <Label className="text-xs text-muted-foreground">Value (internal)</Label>}
                      <Input
                        {...register(`contactTopics.${index}.value`)}
                        placeholder="e.g. booking"
                        disabled={isSubmitting}
                      />
                      {errors.contactTopics?.[index]?.value && (
                        <p className="text-xs text-destructive">{errors.contactTopics[index].value?.message}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      {index === 0 && <Label className="text-xs text-muted-foreground">Label (DE)</Label>}
                      <Input
                        {...register(`contactTopics.${index}.label_de`)}
                        placeholder="Buchung"
                        disabled={isSubmitting}
                      />
                      {errors.contactTopics?.[index]?.label_de && (
                        <p className="text-xs text-destructive">{errors.contactTopics[index].label_de?.message}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      {index === 0 && <Label className="text-xs text-muted-foreground">Label (EN)</Label>}
                      <Input
                        {...register(`contactTopics.${index}.label_en`)}
                        placeholder="Booking"
                        disabled={isSubmitting}
                      />
                      {errors.contactTopics?.[index]?.label_en && (
                        <p className="text-xs text-destructive">{errors.contactTopics[index].label_en?.message}</p>
                      )}
                    </div>
                    <div className={index === 0 ? 'pt-5' : ''}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeTopic(index)}
                        disabled={isSubmitting}
                        title="Remove topic"
                      >
                        <Trash className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => appendTopic({ value: '', label_de: '', label_en: '' })}
                disabled={isSubmitting}
              >
                <Plus className="w-4 h-4" />
                Add Topic
              </Button>

              {topicFields.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No custom topics defined. The form will show the default built-in topics.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* Section Texts                                                        */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="sections">
          <Card>
            <CardHeader>
              <CardTitle>Section Texts</CardTitle>
              <CardDescription>
                Override the default headings and subheadings for each homepage section.
                Leave a field empty to use the default translated text.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Newsletter */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Newsletter</h3>
                <Field id="newsletterHeading" label="Heading">
                  <Input id="newsletterHeading" {...register('newsletterHeading')} disabled={isSubmitting} placeholder="Newsletter" />
                </Field>
                <Field id="newsletterDescription" label="Description">
                  <Input id="newsletterDescription" {...register('newsletterDescription')} disabled={isSubmitting} placeholder="Stay up to date…" />
                </Field>
              </div>

              {/* Spotify */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Spotify</h3>
                <Field id="spotifySectionHeading" label="Heading">
                  <Input id="spotifySectionHeading" {...register('spotifySectionHeading')} disabled={isSubmitting} placeholder="SPOTIFY" />
                </Field>
                <Field id="spotifySectionSubheading" label="Subheading">
                  <Input id="spotifySectionSubheading" {...register('spotifySectionSubheading')} disabled={isSubmitting} placeholder="Listen to our playlist" />
                </Field>
              </div>

              {/* Videos */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Videos</h3>
                <Field id="videosSectionHeading" label="Heading">
                  <Input id="videosSectionHeading" {...register('videosSectionHeading')} disabled={isSubmitting} placeholder="VIDEOS" />
                </Field>
                <Field id="videosSectionSubheading" label="Subheading">
                  <Input id="videosSectionSubheading" {...register('videosSectionSubheading')} disabled={isSubmitting} placeholder="Watch the latest music videos" />
                </Field>
              </div>

              {/* News */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">News</h3>
                <Field id="newsSectionHeading" label="Heading">
                  <Input id="newsSectionHeading" {...register('newsSectionHeading')} disabled={isSubmitting} placeholder="NEWS" />
                </Field>
                <Field id="newsSectionSubheading" label="Subheading">
                  <Input id="newsSectionSubheading" {...register('newsSectionSubheading')} disabled={isSubmitting} placeholder="Always up to date" />
                </Field>
              </div>

              {/* Concerts */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Concerts / Tour</h3>
                <Field id="concertsSectionHeading" label="Heading">
                  <Input id="concertsSectionHeading" {...register('concertsSectionHeading')} disabled={isSubmitting} placeholder="TOUR" />
                </Field>
                <Field id="concertsSectionSubheading" label="Subheading">
                  <Input id="concertsSectionSubheading" {...register('concertsSectionSubheading')} disabled={isSubmitting} placeholder="Live dates and upcoming shows" />
                </Field>
              </div>

              {/* Releases */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Releases</h3>
                <Field id="releasesSectionHeading" label="Heading">
                  <Input id="releasesSectionHeading" {...register('releasesSectionHeading')} disabled={isSubmitting} placeholder="RELEASES" />
                </Field>
                <Field id="releasesSectionSubheading" label="Subheading">
                  <Input id="releasesSectionSubheading" {...register('releasesSectionSubheading')} disabled={isSubmitting} placeholder="Discover the latest music" />
                </Field>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* Hero Section                                                         */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="hero">
          <Card>
            <CardHeader>
              <CardTitle>Hero Section</CardTitle>
              <CardDescription>
                Configure the Hero section at the top of the homepage.
                Releases or News posts marked as &quot;Featured&quot; will automatically appear here.
                The settings below act as fallbacks if the featured item is missing data.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Fallback Background Image</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://cdn.darktunes.com/hero-bg.jpg"
                    {...register('heroCustomBgUrl')}
                    disabled={isSubmitting}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => heroBgInputRef.current?.click()}
                    disabled={isSubmitting || isUploadingHeroBg}
                  >
                    {isUploadingHeroBg ? 'Uploading…' : 'Upload'}
                  </Button>
                  <input
                    ref={heroBgInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) uploadFile(file, 'heroCustomBgUrl', setIsUploadingHeroBg)
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Optional fallback. Used when the featured item has no dedicated hero image.
                </p>
                {errors.heroCustomBgUrl?.message && (
                  <p className="text-xs text-destructive">{errors.heroCustomBgUrl.message}</p>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  id="heroDefaultPrimaryBtnLabel"
                  label="Default Primary Button Label"
                  error={errors.heroDefaultPrimaryBtnLabel?.message}
                >
                  <Input
                    id="heroDefaultPrimaryBtnLabel"
                    {...register('heroDefaultPrimaryBtnLabel')}
                    disabled={isSubmitting}
                    placeholder="e.g. Listen Now"
                  />
                </Field>
                <Field
                  id="heroDefaultSecondaryBtnLabel"
                  label="Default Secondary Button Label"
                  error={errors.heroDefaultSecondaryBtnLabel?.message}
                >
                  <Input
                    id="heroDefaultSecondaryBtnLabel"
                    {...register('heroDefaultSecondaryBtnLabel')}
                    disabled={isSubmitting}
                    placeholder="e.g. Explore Artist"
                  />
                </Field>
              </div>

              <Field id="heroBadge" label="Hero Badge Text (Releases) *" error={errors.heroBadge?.message}>
                <Input id="heroBadge" {...register('heroBadge')} disabled={isSubmitting} />
                <p className="text-xs text-muted-foreground mt-1">
                  Short label shown on the hero badge pill when the featured item is a Release, e.g. &quot;⚡ New Release&quot;.
                </p>
              </Field>

              <Field id="heroNewsBadge" label="Hero Badge Text (News)" error={errors.heroNewsBadge?.message}>
                <Input id="heroNewsBadge" placeholder="e.g. 📰 News" {...register('heroNewsBadge')} disabled={isSubmitting} />
                <p className="text-xs text-muted-foreground mt-1">
                  Short label shown on the hero badge pill when the featured item is a News post, e.g. &quot;📰 News&quot;.
                </p>
              </Field>

              <Field id="heroDescription" label="Fallback Hero Description *" error={errors.heroDescription?.message}>
                <Textarea
                  id="heroDescription"
                  rows={3}
                  {...register('heroDescription')}
                  disabled={isSubmitting}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Only shown when the featured item has no own text. Releases use Promo Text; news uses Excerpt. If those are set, this fallback is never mixed in.
                </p>
              </Field>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* SEO / Meta                                                           */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="seo">
          <Card>
            <CardHeader>
              <CardTitle>SEO &amp; Meta Tags</CardTitle>
              <CardDescription>
                Page title, meta description, and Open Graph tags used by search engines and
                social previews.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field id="seoTitle" label="Page Title *" error={errors.seoTitle?.message}>
                <Input id="seoTitle" {...register('seoTitle')} disabled={isSubmitting} />
              </Field>

              <Field
                id="seoDescription"
                label="Meta Description *"
                error={errors.seoDescription?.message}
              >
                <Textarea
                  id="seoDescription"
                  rows={2}
                  {...register('seoDescription')}
                  disabled={isSubmitting}
                />
              </Field>

              <Field id="ogTitle" label="OG Title *" error={errors.ogTitle?.message}>
                <Input id="ogTitle" {...register('ogTitle')} disabled={isSubmitting} />
              </Field>

              <Field id="ogDescription" label="OG Description *" error={errors.ogDescription?.message}>
                <Textarea
                  id="ogDescription"
                  rows={2}
                  {...register('ogDescription')}
                  disabled={isSubmitting}
                />
              </Field>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* Legal / DSGVO                                                        */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="legal">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Impressum (§ 5 DDG)</CardTitle>
                <CardDescription>
                  Pflichtangaben für das Impressum nach deutschem Recht (DDG/ehem. TMG). Diese Daten erscheinen auf
                  der Seite /impressum.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field
                  id="impressumCompanyName"
                  label="Firmenname *"
                  error={errors.impressumCompanyName?.message}
                >
                  <Input
                    id="impressumCompanyName"
                    {...register('impressumCompanyName')}
                    disabled={isSubmitting}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-4">
                  <Field id="impressumLegalForm" label="Rechtsform" error={errors.impressumLegalForm?.message}>
                    <Input
                      id="impressumLegalForm"
                      placeholder="z.B. GmbH, UG, GbR"
                      {...register('impressumLegalForm')}
                      disabled={isSubmitting}
                    />
                  </Field>
                  <Field id="impressumRepresentative" label="Vertretungsberechtigte(r)" error={errors.impressumRepresentative?.message}>
                    <Input
                      id="impressumRepresentative"
                      placeholder="Vorname Nachname"
                      {...register('impressumRepresentative')}
                      disabled={isSubmitting}
                    />
                  </Field>
                </div>

                <Field id="impressumAddress" label="Anschrift" error={errors.impressumAddress?.message}>
                  <Textarea
                    id="impressumAddress"
                    rows={3}
                    placeholder="Musterstraße 1&#10;12345 Musterstadt&#10;Deutschland"
                    {...register('impressumAddress')}
                    disabled={isSubmitting}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-4">
                  <Field id="impressumPhone" label="Telefon" error={errors.impressumPhone?.message}>
                    <Input
                      id="impressumPhone"
                      type="tel"
                      placeholder="+49 30 ..."
                      {...register('impressumPhone')}
                      disabled={isSubmitting}
                    />
                  </Field>
                  <Field id="impressumEmail" label="E-Mail" error={errors.impressumEmail?.message}>
                    <Input
                      id="impressumEmail"
                      type="email"
                      {...register('impressumEmail')}
                      disabled={isSubmitting}
                    />
                  </Field>
                </div>

                <Field id="impressumVatId" label="USt-IdNr. (§ 27a UStG)" error={errors.impressumVatId?.message}>
                  <Input
                    id="impressumVatId"
                    placeholder="DE123456789"
                    {...register('impressumVatId')}
                    disabled={isSubmitting}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-4">
                  <Field id="impressumRegisterCourt" label="Registergericht" error={errors.impressumRegisterCourt?.message}>
                    <Input
                      id="impressumRegisterCourt"
                      placeholder="Amtsgericht Berlin"
                      {...register('impressumRegisterCourt')}
                      disabled={isSubmitting}
                    />
                  </Field>
                  <Field id="impressumRegisterNumber" label="Registernummer" error={errors.impressumRegisterNumber?.message}>
                    <Input
                      id="impressumRegisterNumber"
                      placeholder="HRB 12345"
                      {...register('impressumRegisterNumber')}
                      disabled={isSubmitting}
                    />
                  </Field>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Label-Rechnungsadresse (PDF)</CardTitle>
                <CardDescription>
                  Strukturierte Adresse für SOS-Rechnungen (Leistungsempfänger). Optional — sonst
                  Freitext aus dem Impressum. Platzhalter in AGB: {'{{labelName}}'}, {'{{address}}'},{' '}
                  {'{{vatId}}'}, …
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field id="labelBillingStreet" label="Straße / Hausnummer" error={errors.labelBillingStreet?.message}>
                  <Input id="labelBillingStreet" {...register('labelBillingStreet')} disabled={isSubmitting} />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field id="labelBillingPostalCode" label="PLZ" error={errors.labelBillingPostalCode?.message}>
                    <Input id="labelBillingPostalCode" {...register('labelBillingPostalCode')} disabled={isSubmitting} />
                  </Field>
                  <Field id="labelBillingCity" label="Ort" error={errors.labelBillingCity?.message}>
                    <Input id="labelBillingCity" {...register('labelBillingCity')} disabled={isSubmitting} />
                  </Field>
                </div>
                <Field id="labelBillingCountry" label="Land" error={errors.labelBillingCountry?.message}>
                  <Input id="labelBillingCountry" placeholder="DE" {...register('labelBillingCountry')} disabled={isSubmitting} />
                </Field>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>AGB Artist Portal</CardTitle>
                <CardDescription>
                  Nutzungs- und Abrechnungsbedingungen (/agb). Leer = Standardvorlage mit Platzhaltern.
                  Version steuert erneute Opt-in-Pflicht im Portal.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field id="portalTermsVersion" label="AGB-Version" error={errors.portalTermsVersion?.message}>
                  <Input
                    id="portalTermsVersion"
                    placeholder="2026-08-01"
                    {...register('portalTermsVersion')}
                    disabled={isSubmitting}
                  />
                </Field>
                <Field id="agbContent" label="AGB (Deutsch)" error={errors.agbContent?.message}>
                  <Controller
                    name="agbContent"
                    control={control}
                    render={({ field }) => (
                      <TiptapEditor
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        disabled={isSubmitting}
                        placeholder="{{labelName}} {{address}} {{email}}"
                        grow
                      />
                    )}
                  />
                </Field>
                <Field id="agbContentEn" label="Terms (English)" error={errors.agbContentEn?.message}>
                  <Controller
                    name="agbContentEn"
                    control={control}
                    render={({ field }) => (
                      <TiptapEditor
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        disabled={isSubmitting}
                        placeholder="{{labelName}} {{address}} {{email}}"
                        grow
                      />
                    )}
                  />
                </Field>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Datenschutzerklärung</CardTitle>
                <CardDescription>
                  Volltext der Datenschutzerklärung. Erscheint auf /datenschutz.
                  Leer lassen für Standard-Boilerplate (inkl. Artist-Portal-Abschnitt).
                  Platzhalter: {'{{labelName}}'}, {'{{address}}'}, {'{{email}}'}.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field
                  id="datenschutzContent"
                  label="Datenschutztext (Deutsch)"
                  error={errors.datenschutzContent?.message}
                >
                  <Controller
                    name="datenschutzContent"
                    control={control}
                    render={({ field }) => (
                      <TiptapEditor
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        disabled={isSubmitting}
                        placeholder="Hier den deutschen Datenschutztext einfügen…"
                        grow
                      />
                    )}
                  />
                </Field>

                <Field
                  id="datenschutzContentEn"
                  label="Privacy Policy (English)"
                  error={errors.datenschutzContentEn?.message}
                >
                  <Controller
                    name="datenschutzContentEn"
                    control={control}
                    render={({ field }) => (
                      <TiptapEditor
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        disabled={isSubmitting}
                        placeholder="Enter the English privacy policy text here…"
                        grow
                      />
                    )}
                  />
                </Field>

                <Field
                  id="consentPlaceholderUrl"
                  label="Consent-Platzhalterbild (R2 URL)"
                  error={errors.consentPlaceholderUrl?.message}
                >
                  <Input
                    id="consentPlaceholderUrl"
                    placeholder="https://cdn.darktunes.com/consent-placeholder.jpg"
                    {...register('consentPlaceholderUrl')}
                    disabled={isSubmitting}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Bild aus dem R2-Bucket, das angezeigt wird, bevor der Nutzer externen Inhalten
                    (Spotify, YouTube) zugestimmt hat.
                  </p>
                </Field>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        {/* ------------------------------------------------------------------ */}
        {/* Roles & Permissions                                                   */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="roles">
          <Suspense fallback={<div className="p-8 text-muted-foreground text-sm">Loading…</div>}>
            <RolesManager />
          </Suspense>
        </TabsContent>
      </Tabs>

      {activeTab !== 'roles' && (
        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting} className="min-w-[140px]">
            {isSubmitting ? 'Saving…' : 'Save Settings'}
          </Button>
        </div>
      )}
    </form>
  )
}
