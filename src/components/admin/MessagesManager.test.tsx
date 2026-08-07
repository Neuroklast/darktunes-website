import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MessagesManager } from './MessagesManager'

const {
  mockToastError,
  mockGetArtists,
  mockGetAllLabelMessages,
  mockSearchLabelMessages,
  mockGetRepliesForMessage,
  mockSetSession,
  mockSupabase,
} = vi.hoisted(() => {
  const mockToastError = vi.fn()
  const mockGetArtists = vi.fn()
  const mockGetAllLabelMessages = vi.fn()
  const mockSearchLabelMessages = vi.fn()
  const mockGetRepliesForMessage = vi.fn()
  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  }
  const mockSetSession = vi.fn().mockResolvedValue({ error: null })
  const mockSupabase = {
    auth: { setSession: mockSetSession },
    channel: vi.fn().mockReturnValue(mockChannel),
    removeChannel: vi.fn().mockResolvedValue(undefined),
  }

  return {
    mockToastError,
    mockGetArtists,
    mockGetAllLabelMessages,
    mockSearchLabelMessages,
    mockGetRepliesForMessage,
    mockSetSession,
    mockSupabase,
  }
})

vi.mock('@phosphor-icons/react', () => ({
  PencilSimple: () => null,
  ArrowBendUpLeft: () => null,
  ArrowBendUpRight: () => null,
  Star: () => null,
  StarFour: () => null,
  Trash: () => null,
  Download: () => null,
  Paperclip: () => null,
  Tray: () => null,
  Microphone: () => null,
  PaperPlaneTilt: () => null,
  Folder: () => null,
  Plus: () => null,
  X: () => null,
  Check: () => null,
  Pencil: () => null,
  ToggleLeft: () => null,
  ToggleRight: () => null,
  Warning: () => null,
  Globe: () => null,
  FilePdf: () => null,
  FileZip: () => null,
  FileImage: () => null,
  FileAudio: () => null,
  FileVideo: () => null,
  FileDoc: () => null,
  FileArrowDown: () => null,
  File: () => null,
  SpeakerHigh: () => null,
  SpeakerSlash: () => null,
  ChatsCircle: () => null,
  CaretDown: () => null,
  CaretUp: () => null,
  // RichTextEditor / Tiptap bubble menus (pulled in via inline reply)
  TextAlignLeft: () => null,
  TextAlignCenter: () => null,
  TextAlignRight: () => null,
  TextB: () => null,
  TextItalic: () => null,
  TextUnderline: () => null,
  TextStrikethrough: () => null,
  ListBullets: () => null,
  ListNumbers: () => null,
  Link: () => null,
  LinkBreak: () => null,
  Image: () => null,
  Code: () => null,
  Quotes: () => null,
  TextHOne: () => null,
  TextHTwo: () => null,
  TextHThree: () => null,
}))

vi.mock('@/components/messaging/RichTextEditor', () => ({
  RichTextEditor: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string
    onChange: (html: string, text: string) => void
    placeholder?: string
  }) => (
    <textarea
      aria-label={placeholder ?? 'Reply'}
      value={value}
      onChange={(e) => onChange(e.target.value, e.target.value)}
    />
  ),
}))

vi.mock('sonner', () => ({
  toast: {
    error: mockToastError,
    success: vi.fn(),
  },
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    asChild,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) => {
    if (asChild && React.isValidElement(children)) return children
    return <button {...props}>{children}</button>
  },
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({
    loading: false,
    session: {
      access_token: 'access-token',
      refresh_token: 'refresh-token',
    },
  }),
}))

vi.mock('@/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => mockSupabase,
}))

vi.mock('@/lib/api/artists', () => ({
  getArtists: mockGetArtists,
}))

vi.mock('@/lib/api/artistReplies', () => ({
  getRepliesForMessage: mockGetRepliesForMessage,
}))

vi.mock('@/lib/api/labelMessages', () => ({
  getAllLabelMessages: mockGetAllLabelMessages,
  searchLabelMessages: mockSearchLabelMessages,
  softDeleteMessage: vi.fn(),
  starMessage: vi.fn(),
  markMessageRead: vi.fn(),
}))

vi.mock('@/lib/api/portalMessages', () => ({
  getIncomingToLabelMessages: vi.fn().mockResolvedValue([]),
  markPortalMessageRead: vi.fn(),
  softDeletePortalMessage: vi.fn(),
  togglePortalMessageStar: vi.fn(),
}))

vi.mock('@/lib/api/messageFolders', () => ({
  getFolders: vi.fn().mockResolvedValue([]),
  createFolder: vi.fn(),
  updateFolder: vi.fn(),
  deleteFolder: vi.fn(),
  moveMessageToFolder: vi.fn(),
}))

vi.mock('@/lib/api/messageRules', () => ({
  getRules: vi.fn().mockResolvedValue([]),
  createRule: vi.fn(),
  updateRule: vi.fn(),
  deleteRule: vi.fn(),
}))

vi.mock('@/lib/api/messageAttachments', () => ({
  getAttachmentsForMessage: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/components/messaging/MessageSearch', () => ({
  MessageSearch: () => <div data-testid="search" />,
}))

vi.mock('@/components/messaging/FolderTree', () => ({
  FolderTree: () => <div data-testid="folder-tree" />,
}))

vi.mock('@/components/messaging/MessageRulesManager', () => ({
  MessageRulesManager: () => null,
}))

vi.mock('@/components/messaging/ExternalEmailComposer', () => ({
  ExternalEmailComposer: () => null,
}))

vi.mock('@/components/messaging/AttachmentViewer', () => ({
  AttachmentViewer: () => null,
}))

describe('MessagesManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSetSession.mockResolvedValue({ error: null })
    mockGetArtists.mockResolvedValue([])
    mockGetAllLabelMessages.mockResolvedValue([])
    mockSearchLabelMessages.mockResolvedValue([])
    mockGetRepliesForMessage.mockResolvedValue([])
  })

  it('syncs the authenticated session into the local client before loading messages', async () => {
    mockGetArtists.mockResolvedValue([
      { id: 'artist-1', name: 'Artist One' },
      { id: 'artist-2', name: 'Artist Two' },
    ])

    render(<MessagesManager />)

    await waitFor(() => {
      expect(mockSetSession).toHaveBeenCalledWith({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
      })
    })
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /compose/i })).toHaveAttribute(
        'href',
        '/admin/messages/compose',
      )
    })
  })

  it('still loads the mailbox when artist list is empty', async () => {
    mockGetArtists.mockResolvedValue([])

    render(<MessagesManager />)

    await waitFor(() => expect(mockGetAllLabelMessages).toHaveBeenCalled())
    expect(screen.getByRole('link', { name: /compose/i })).toBeInTheDocument()
  })
})
