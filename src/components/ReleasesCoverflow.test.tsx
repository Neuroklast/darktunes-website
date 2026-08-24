import type { AnchorHTMLAttributes, ImgHTMLAttributes, ReactNode } from 'react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SwiperProps } from 'swiper/react'
import { testMessages } from '@/test/mockNextIntl'
import type { Release } from '@/types'
import { ReleasesCoverflow } from './ReleasesCoverflow'

const mockedState = vi.hoisted(() => ({
  latestSwiperProps: null as SwiperProps | null,
  reducedMotion: false,
}))

vi.mock('next/link', () => {
  const Link = React.forwardRef<
    HTMLAnchorElement,
    AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }
  >(({ href, children, ...props }, ref) => (
    <a ref={ref} href={href} {...props}>
      {children}
    </a>
  ))

  Link.displayName = 'MockLink'

  return { default: Link }
})

vi.mock('next/image', () => ({
  default: ({
    alt,
    src,
    fill,
    unoptimized,
    priority,
    sizes,
    quality,
    placeholder,
    blurDataURL,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & {
    src: string
    fill?: boolean
    unoptimized?: boolean
    priority?: boolean
    quality?: number
    placeholder?: string
    blurDataURL?: string
  }) => {
    void fill
    void unoptimized
    void priority
    void sizes
    void quality
    void placeholder
    void blurDataURL

    void props
    return <span aria-label={alt} data-src={src} />
  },
}))

vi.mock('framer-motion', () => ({
  useReducedMotion: () => mockedState.reducedMotion,
}))

vi.mock('swiper/modules', () => ({
  EffectCoverflow: Symbol('EffectCoverflow'),
  Virtual: Symbol('Virtual'),
  Keyboard: Symbol('Keyboard'),
  Autoplay: Symbol('Autoplay'),
}))

vi.mock('swiper/react', () => ({
  Swiper: ({ children, ...props }: SwiperProps & { children?: ReactNode }) => {
    mockedState.latestSwiperProps = props
    return <div data-testid="mock-swiper">{children}</div>
  },
  SwiperSlide: ({ children }: { children?: ReactNode | ((state: { isActive: boolean }) => ReactNode) }) => (
    <div>{typeof children === 'function' ? children({ isActive: true }) : children}</div>
  ),
}))

const buildRelease = (id: string, title: string): Release => ({
  id,
  title,
  artistId: `artist-${id}`,
  artistName: `Artist ${id}`,
  releaseDate: '2026-01-01',
  coverArt: `https://example.com/${id}.jpg`,
  type: 'single',
  featured: false,
  isVisible: true,
  isPromo: false,
})

const releases = [buildRelease('release-1', 'Release One'), buildRelease('release-2', 'Release Two')]

const triggerSlideTransitionEnd = (nextActiveIndex: number) => {
  const callback = mockedState.latestSwiperProps?.onSlideChangeTransitionEnd
  if (!callback) throw new Error('onSlideChangeTransitionEnd callback missing')

  callback({ activeIndex: nextActiveIndex } as never)
}

describe('ReleasesCoverflow', () => {
  beforeEach(() => {
    mockedState.latestSwiperProps = null
    mockedState.reducedMotion = false
    vi.restoreAllMocks()
  })

  it('renders without crashing with a list of releases', () => {
    render(<ReleasesCoverflow releases={releases} />)

    expect(screen.getByRole('region', { name: testMessages.releases.coverflowRegionLabel })).toBeInTheDocument()
  })

  it('renders active release title in metadata block', () => {
    render(<ReleasesCoverflow releases={releases} />)

    expect(screen.getByText(releases[0].title)).toBeInTheDocument()
  })

  it('uses overlay link href for the first release on initial render', () => {
    render(<ReleasesCoverflow releases={releases} />)

    const overlayLink = screen.getByRole('link', {
      name: `${releases[0].title} by ${releases[0].artistName} – ${testMessages.releases.openReleaseAriaSuffix}`,
    })

    expect(overlayLink).toHaveAttribute('href', `/releases/${releases[0].id}`)
  })

  it('updates overlay link href after slide transition ends', () => {
    render(<ReleasesCoverflow releases={releases} />)

    act(() => {
      triggerSlideTransitionEnd(1)
    })

    const overlayLink = screen.getByRole('link', {
      name: `${releases[1].title} by ${releases[1].artistName} – ${testMessages.releases.openReleaseAriaSuffix}`,
    })

    expect(overlayLink).toHaveAttribute('href', `/releases/${releases[1].id}`)
  })

  it('formats release dates on the client after render', async () => {
    const toLocaleDateStringSpy = vi
      .spyOn(Date.prototype, 'toLocaleDateString')
      .mockReturnValue('client-formatted-date')

    render(<ReleasesCoverflow releases={releases} />)

    await waitFor(() => {
      expect(screen.getByText('client-formatted-date')).toBeInTheDocument()
    })

    expect(toLocaleDateStringSpy).toHaveBeenCalledWith('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  })

  it('prevents overlay navigation after a drag and allows it again on the next click', () => {
    render(<ReleasesCoverflow releases={releases} />)

    const overlayLink = screen.getByRole('link', {
      name: `${releases[0].title} by ${releases[0].artistName} – ${testMessages.releases.openReleaseAriaSuffix}`,
    })

    // Simulate a Swiper drag: touchStart resets isDragging, touchMove sets it to true
    act(() => {
      mockedState.latestSwiperProps?.onTouchStart?.(null as never, {} as never)
      mockedState.latestSwiperProps?.onTouchMove?.(null as never, {} as never)
    })

    const dragClick = createEvent.click(overlayLink)
    fireEvent(overlayLink, dragClick)
    expect(dragClick.defaultPrevented).toBe(true)

    const nextClick = createEvent.click(overlayLink)
    fireEvent(overlayLink, nextClick)
    expect(nextClick.defaultPrevented).toBe(false)

    // Simulate a tap: touchStart only resets isDragging, no move — click is allowed
    act(() => {
      mockedState.latestSwiperProps?.onTouchStart?.(null as never, {} as never)
    })
    const tapClick = createEvent.click(overlayLink)
    fireEvent(overlayLink, tapClick)
    expect(tapClick.defaultPrevented).toBe(false)
  })

  it('uses overflow-clip on the Swiper wrapper without blanket Lenis prevent', () => {
    const { container } = render(
      <ReleasesCoverflow releases={releases} />,
    )

    const wrapper = container.querySelector('.overflow-clip')
    expect(wrapper).toBeTruthy()
    expect(wrapper).toHaveClass('overflow-clip')
    // Vertical wheel stays on Lenis; only real nested scrollports use data-lenis-prevent
    expect(wrapper).not.toHaveAttribute('data-lenis-prevent')
  })

  it('sets Swiper speed to 0 when reduced motion is enabled', () => {
    mockedState.reducedMotion = true

    render(<ReleasesCoverflow releases={releases} />)

    expect(mockedState.latestSwiperProps?.speed).toBe(0)
  })

  it('renders the expected aria-label on the region container', () => {
    render(<ReleasesCoverflow releases={releases} />)

    expect(screen.getByRole('region', { name: testMessages.releases.coverflowRegionLabel })).toBeInTheDocument()
  })

  it('renders previous and next buttons with proper aria-labels', () => {
    render(<ReleasesCoverflow releases={releases} />)

    expect(screen.getByRole('button', { name: testMessages.releases.previousReleaseAriaLabel })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: testMessages.releases.nextReleaseAriaLabel })).toBeInTheDocument()
  })

  it('marks active dot with aria-pressed=true', () => {
    render(<ReleasesCoverflow releases={releases} />)

    const firstDot = screen.getByRole('button', {
      name: testMessages.releases.goToReleaseAriaLabelTemplate
        .replace('{index}', '1')
        .replace('{title}', releases[0].title),
    })

    expect(firstDot).toHaveAttribute('aria-pressed', 'true')
  })
})
