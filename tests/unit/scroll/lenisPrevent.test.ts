import { describe, expect, it } from 'vitest'
import { shouldPreventLenis } from '@/lib/scroll/lenisPrevent'

describe('shouldPreventLenis', () => {
  it('returns true inside data-lenis-prevent', () => {
    document.body.innerHTML = `
      <div id="panel" data-lenis-prevent>
        <span id="target">x</span>
      </div>
    `
    const target = document.getElementById('target')!
    expect(shouldPreventLenis(target)).toBe(true)
  })

  it('returns true inside scroll-area viewport', () => {
    document.body.innerHTML = `
      <div data-slot="scroll-area-viewport">
        <span id="target">x</span>
      </div>
    `
    const target = document.getElementById('target')!
    expect(shouldPreventLenis(target)).toBe(true)
  })

  it('returns true inside a container that actually overflows vertically', () => {
    document.body.innerHTML = `
      <div id="panel" class="overflow-y-auto">
        <div><span id="target">x</span></div>
      </div>
    `
    const panel = document.getElementById('panel') as HTMLElement
    // jsdom has no layout engine — stub metrics + computed overflow
    Object.defineProperty(panel, 'scrollHeight', { configurable: true, value: 200 })
    Object.defineProperty(panel, 'clientHeight', { configurable: true, value: 40 })
    const style = window.getComputedStyle(panel)
    Object.defineProperty(style, 'overflowY', { configurable: true, value: 'auto' })
    const original = window.getComputedStyle.bind(window)
    window.getComputedStyle = ((el: Element) => {
      if (el === panel) return style
      return original(el)
    }) as typeof window.getComputedStyle

    const target = document.getElementById('target')!
    expect(shouldPreventLenis(target)).toBe(true)
    window.getComputedStyle = original
  })

  it('returns false for overflow-x-auto class when content does not overflow', () => {
    // Mirrors homepage Videos: class token present, no real horizontal overflow (desktop grid)
    document.body.innerHTML = `
      <ul id="panel" class="flex overflow-x-auto md:overflow-x-visible" style="overflow-x: visible; width: 400px;">
        <li style="width: 100px"><span id="target">card</span></li>
      </ul>
    `
    const target = document.getElementById('target')!
    expect(shouldPreventLenis(target)).toBe(false)
  })

  it('returns false for horizontal-only overflow (carousel / related strip)', () => {
    // Horizontal strips must not create a vertical Lenis dead-zone
    document.body.innerHTML = `
      <div id="panel" class="overflow-x-auto">
        <span id="target">card</span>
      </div>
    `
    const panel = document.getElementById('panel') as HTMLElement
    Object.defineProperty(panel, 'scrollWidth', { configurable: true, value: 800 })
    Object.defineProperty(panel, 'clientWidth', { configurable: true, value: 200 })
    Object.defineProperty(panel, 'scrollHeight', { configurable: true, value: 40 })
    Object.defineProperty(panel, 'clientHeight', { configurable: true, value: 40 })
    const style = window.getComputedStyle(panel)
    Object.defineProperty(style, 'overflowX', { configurable: true, value: 'auto' })
    Object.defineProperty(style, 'overflowY', { configurable: true, value: 'visible' })
    const original = window.getComputedStyle.bind(window)
    window.getComputedStyle = ((el: Element) => {
      if (el === panel) return style
      return original(el)
    }) as typeof window.getComputedStyle

    const target = document.getElementById('target')!
    expect(shouldPreventLenis(target)).toBe(false)
    window.getComputedStyle = original
  })

  it('returns false for plain content', () => {
    document.body.innerHTML = `<p id="target">hello</p>`
    const target = document.getElementById('target')!
    expect(shouldPreventLenis(target)).toBe(false)
  })
})
