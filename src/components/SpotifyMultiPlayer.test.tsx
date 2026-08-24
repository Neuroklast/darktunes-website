import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SpotifyMultiPlayer } from './SpotifyMultiPlayer'
import { getSpotifyEmbedPath } from '@/lib/spotifyEmbedPath'

vi.mock('framer-motion', () => ({
  motion: {
    div: (props: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => {
      const { children, ...domProps } = props
      delete domProps.initial
      delete domProps.animate
      delete domProps.transition
      delete domProps.whileInView
      delete domProps.viewport
      return <div {...domProps}>{children}</div>
    },
  },
  useReducedMotion: () => true,
}))

const mockScrollTo = vi.fn()
const mockLenis = { scroll: 100, scrollTo: mockScrollTo }

vi.mock('@/components/animations/LenisProvider', () => ({
  useLenis: () => mockLenis,
}))

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}))

describe('SpotifyMultiPlayer', () => {
  it('loads Spotify iframe immediately without any activation step', () => {
    render(
      <SpotifyMultiPlayer
        playlists={[{ uri: 'spotify:playlist:37i9dQZF1DWWqNV5cS50j6', label: 'Label Playlist' }]}
      />,
    )

    const iframe = screen.getByTitle('Spotify playlist: Label Playlist')
    expect(iframe).toBeInTheDocument()
    expect(iframe).toHaveAttribute('loading', 'eager')
  })

  it('renders only the active playlist iframe and updates src on tab change', () => {
    render(
      <SpotifyMultiPlayer
        playlists={[
          { uri: 'spotify:playlist:37i9dQZF1DWWqNV5cS50j6', label: 'One' },
          { uri: 'spotify:playlist:37i9dQZF1DX4WYpdgoIcn6', label: 'Two' },
        ]}
      />,
    )

    let iframes = screen.getAllByTitle(/Spotify playlist:/i)
    expect(iframes).toHaveLength(1)
    expect(iframes[0]).toHaveAttribute(
      'src',
      expect.stringContaining(getSpotifyEmbedPath('spotify:playlist:37i9dQZF1DWWqNV5cS50j6')),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Two' }))

    iframes = screen.getAllByTitle(/Spotify playlist:/i)
    expect(iframes).toHaveLength(1)
    expect(iframes[0]).toHaveAttribute(
      'src',
      expect.stringContaining(getSpotifyEmbedPath('spotify:playlist:37i9dQZF1DX4WYpdgoIcn6')),
    )
  })

  it('routes wheel over the overlay through Lenis virtual scroll', () => {
    mockScrollTo.mockClear()
    render(
      <SpotifyMultiPlayer
        playlists={[{ uri: 'spotify:playlist:37i9dQZF1DWWqNV5cS50j6', label: 'Label Playlist' }]}
      />,
    )

    const overlay = document.querySelector('.absolute.inset-0.z-10')
    expect(overlay).toBeTruthy()
    fireEvent.wheel(overlay!, { deltaY: 80 })

    expect(mockScrollTo).toHaveBeenCalledWith(180, { immediate: false, force: true })
  })
})
