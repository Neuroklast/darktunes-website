/**
 * Hero item description — promo/excerpt teaser on the homepage hero.
 *
 * Product rule:
 * - Release with promoText → teaser from promo (never site heroDescription)
 * - News with excerpt → teaser from excerpt (never site heroDescription)
 * - Global heroDescription only when the featured item has no own text
 */

/** Default max length for the hero description teaser (characters). */
export const HERO_PROMO_TEASER_MAX_CHARS = 160

/**
 * Returns a single-line teaser, truncated with an ellipsis when longer than
 * `maxChars`. Empty / whitespace-only input → null.
 */
export function formatHeroPromoTeaser(
  promoText: string | undefined | null,
  maxChars: number = HERO_PROMO_TEASER_MAX_CHARS,
): string | null {
  if (maxChars < 1) return null

  const cleaned = (promoText ?? '').replace(/\s+/g, ' ').trim()
  if (!cleaned) return null

  if (cleaned.length <= maxChars) return cleaned

  // Leave room for the ellipsis character in the visual budget.
  const budget = Math.max(1, maxChars - 1)
  const slice = cleaned.slice(0, budget)
  const lastSpace = slice.lastIndexOf(' ')
  // Prefer a word boundary when it does not discard most of the teaser.
  const base =
    lastSpace > Math.floor(budget * 0.55) ? slice.slice(0, lastSpace) : slice

  return `${base.trimEnd()}…`
}

export type HeroItemDescriptionInput = {
  kind: 'release' | 'news'
  /** Release.promoText — preferred body copy for release hero slides. */
  promoText?: string | null
  /** NewsPost.excerpt — preferred body copy for news hero slides. */
  excerpt?: string | null
  /**
   * Site-wide fallback (editable in Admin → Site Settings).
   * Used ONLY when the featured item has no promo/excerpt of its own.
   */
  fallback?: string | null
}

/**
 * Resolves the hero description under the product rule above.
 * Returns null when neither item text nor fallback is available (caller hides the paragraph).
 */
export function resolveHeroItemDescription(input: HeroItemDescriptionInput): string | null {
  const itemSource =
    input.kind === 'release' ? input.promoText : input.excerpt

  const itemTeaser = formatHeroPromoTeaser(itemSource)
  if (itemTeaser) return itemTeaser

  const fallback = (input.fallback ?? '').replace(/\s+/g, ' ').trim()
  return fallback || null
}
