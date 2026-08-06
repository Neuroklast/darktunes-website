import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProfileForm } from '../../../app/portal/profile/_components/ProfileForm'

const { IconStub } = vi.hoisted(() => ({
  IconStub: () => null,
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

vi.mock('react-hook-form', () => ({
  Controller: ({ render, name }: { render: (props: { field: { value: string; onChange: () => void; name: string } }) => React.ReactNode; name: string }) =>
    render({ field: { value: '', onChange: vi.fn(), name } }),
  useFieldArray: () => ({
    fields: [],
    append: vi.fn(),
    remove: vi.fn(),
  }),
}))

vi.mock('@/hooks/usePortalProfileForm', () => ({
  PORTAL_PHOTO_MAX_BYTES: 5000000,
  usePortalProfileForm: () => ({
    form: {
      control: {},
      register: () => ({ name: 'field', onChange: vi.fn(), onBlur: vi.fn(), ref: vi.fn() }),
      formState: { errors: {} },
      handleSubmit: (fn: () => void) => (e?: Event) => {
        e?.preventDefault()
        fn()
      },
      watch: () => '',
      setValue: vi.fn(),
    },
    photoUrl: '',
    uploadProgress: null,
    isUploading: false,
    fileInputRef: { current: null },
    riderUrls: [],
    riderUploading: false,
    galleryPhotos: [],
    galleryUploading: false,
    handlePhotoChange: vi.fn(),
    handleRiderUpload: vi.fn(),
    handleRiderDelete: vi.fn(),
    handleGalleryUpload: vi.fn(),
    handleGalleryRemove: vi.fn(),
    onSubmit: (e?: Event) => e?.preventDefault(),
  }),
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, asChild, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode; asChild?: boolean }) => {
    if (asChild) return <>{children}</>
    return <button {...props}>{children}</button>
  },
}))

vi.mock('@/components/ui/input', () => ({
  Input: ({ children, ...props }: { children?: React.ReactNode }) => React.createElement('input', props, children),
}))

vi.mock('@/components/ui/textarea', () => ({
  Textarea: ({ children, ...props }: { children?: React.ReactNode }) => React.createElement('textarea', props, children),
}))

vi.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }: { children?: React.ReactNode }) => React.createElement('label', props, children),
}))

vi.mock('@/components/ui/progress', () => ({
  Progress: ({ children, ...props }: { children?: React.ReactNode }) => React.createElement('div', props, children),
}))

vi.mock('@/components/ui/genre-tag-picker', () => ({
  GenreTagPicker: ({ children, ...props }: { children?: React.ReactNode }) => React.createElement('div', props, children),
}))

vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  AvatarImage: (props: React.ImgHTMLAttributes<HTMLImageElement>) => React.createElement('img', { ...props, alt: props.alt ?? '' }),
  AvatarFallback: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children?: React.ReactNode }) => <section>{children}</section>,
  CardHeader: ({ children }: { children?: React.ReactNode }) => <header>{children}</header>,
  CardContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
  CardDescription: ({ children }: { children?: React.ReactNode }) => <p>{children}</p>,
}))

vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children?: React.ReactNode }) => <button type="button">{children}</button>,
  TabsContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/admin/TiptapEditor', () => ({
  TiptapEditor: () => <div>editor</div>,
}))

vi.mock('@phosphor-icons/react', () => ({
  Camera: IconStub,
  FloppyDisk: IconStub,
  Eye: IconStub,
  TextAlignLeft: IconStub,
  LinkSimple: IconStub,
  Info: IconStub,
  FileText: IconStub,
  Trash: IconStub,
  PlugsConnected: IconStub,
  ArrowsClockwise: IconStub,
}))

vi.mock(
  '../../../app/portal/profile/_components/BandsintownIntegrationsCard',
  () => ({
    BandsintownIntegrationsCard: () => <div data-testid="bandsintown-integrations" />,
  }),
)

describe('EPK preview fallback coverage', () => {
  it('renders legacy EPK preview entry points in ProfileForm', () => {
    render(
      <ProfileForm
        artistId="artist-1"
        artistName="Artist"
        artistSlug="artist"
        initialProfile={null}
        artist={null}
      />,
    )

    const builderLink = screen.getByRole('link', { name: /epk_builder_nav/i })
    expect(builderLink).toHaveAttribute('href', '/portal/epk-builder?artistId=artist-1')

    const publicPreviewLink = screen.getByRole('link', { name: /profile_preview_public/i })
    expect(publicPreviewLink).toHaveAttribute('href', '/artists/artist')

    expect(screen.getByText('profile_bio_short')).toBeInTheDocument()
    expect(screen.getByText('profile_bio_medium')).toBeInTheDocument()
    expect(screen.getByText('profile_bio_long')).toBeInTheDocument()
  })
})
