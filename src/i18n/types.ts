import type enDict from './messages/en/index'
import type { AppLocale } from './locales'

/** Supported locales (en, de, fr) */
export type Locale = AppLocale

/**
 * Full dictionary type — structurally derived from the English baseline.
 * Other locales must expose the same key tree (parity tests).
 */
export type Dictionary = typeof enDict

/** Convenience alias for portal dictionary keys (EPK keys included via en.json baseline). */
export type PortalDictionary = Dictionary['portal']
