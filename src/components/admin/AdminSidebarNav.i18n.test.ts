import { describe, expect, it } from 'vitest'
import deAdmin from '@/i18n/messages/de/admin.json'
import enAdmin from '@/i18n/messages/en/admin.json'
import frAdmin from '@/i18n/messages/fr/admin.json'

/**
 * Must stay in sync with NAV_GROUPS / DASHBOARD_ITEM in AdminSidebarNav.tsx
 * and TAB_DEFS labelKeys in AdminDashboard.tsx.
 */
const REQUIRED_NAV_KEYS = [
  'dashboard',
  'group_content',
  'group_submissions',
  'group_communication',
  'group_finance',
  'group_press',
  'group_people',
  'group_settings',
  'group_operations',
  'artists',
  'releases',
  'news',
  'videos',
  'events',
  'tourProduction',
  'releaseSubmissions',
  'videoSubmissions',
  'fanPageReviews',
  'artistFeedback',
  'submissionForm',
  'pressAccreditations',
  'pressPortal',
  'assets',
  'genres',
  'accounting',
  'labelIntelligence',
  'statements',
  'messages',
  'promotionActivity',
  'users',
  'portalFaq',
  'featureFlags',
  'colors',
  'settings',
  'apiKeys',
  'aiAssistant',
  'support',
  'system',
  'signOut',
  'sectionsAria',
  'navigationAria',
  'openNavAria',
  'navigationTitle',
  'role_admin',
  'role_editor',
  'accreditations',
  'promoLog',
  'rolesPermissions',
  'maintenance',
] as const

describe('AdminSidebarNav i18n', () => {
  it('required admin.nav keys exist in en/de/fr with string values', () => {
    for (const [name, nav] of [
      ['en', enAdmin.nav],
      ['de', deAdmin.nav],
      ['fr', frAdmin.nav],
    ] as const) {
      for (const key of REQUIRED_NAV_KEYS) {
        expect(nav, `${name}.nav missing ${key}`).toHaveProperty(key)
        expect(typeof (nav as Record<string, unknown>)[key], `${name}.nav.${key}`).toBe(
          'string',
        )
      }
    }
  })
})
