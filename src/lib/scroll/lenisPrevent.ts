/**
 * Tell Lenis to yield wheel/touch events to nested native scroll.
 *
 * Prefer explicit `data-lenis-prevent` on real **vertical** scrollports
 * (ScrollPanel, dialogs, admin list panes). Fallback: only ancestors that
 * actually overflow **vertically** (computed overflow + scroll metrics).
 *
 * Horizontal-only overflow (carousels, mobile snap strips, wide tables without
 * vertical scroll) must NOT block document Lenis — that created dead zones and
 * janky native handoffs. Horizontal widgets use drag / native pan-x instead.
 *
 * Never match Tailwind class substrings like `overflow-x-auto` alone
 * (responsive grids keep that token while `md:overflow-x-visible` wins on desktop).
 */
export function shouldPreventLenis(node: Element): boolean {
  if (node.closest('[data-lenis-prevent]')) return true
  if (node.closest('[data-slot="scroll-area-viewport"]')) return true

  let el: Element | null = node
  while (el && el !== document.documentElement) {
    if (el instanceof HTMLElement && isActuallyVerticallyScrollable(el)) return true
    el = el.parentElement
  }
  return false
}

function isActuallyVerticallyScrollable(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el)
  const oy = style.overflowY
  return (
    (oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
    el.scrollHeight > el.clientHeight + 1
  )
}
