// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { initializeAppNavigation } from './app-navigation'

const mobileQuery = '(max-width: 52rem)'
const reducedMotionQuery = '(prefers-reduced-motion: reduce)'

class TestMediaQueryEvent extends Event implements MediaQueryListEvent {
  readonly matches: boolean
  readonly media: string

  constructor(query: MediaQueryList) {
    super('change')
    this.matches = query.matches
    this.media = query.media
  }
}

class TestMediaQueryList extends EventTarget implements MediaQueryList {
  matches: boolean
  readonly media: string
  onchange: MediaQueryList['onchange'] = null
  private readonly legacyListeners = new Map<
    NonNullable<MediaQueryList['onchange']>, EventListener
  >()

  constructor(media: string, matches: boolean) {
    super()
    this.media = media
    this.matches = matches
  }

  addListener(callback: MediaQueryList['onchange']): void {
    if (!callback) return

    const listener: EventListener = event => {
      if (event instanceof TestMediaQueryEvent) callback.call(this, event)
    }

    this.legacyListeners.set(callback, listener)
    this.addEventListener('change', listener)
  }

  removeListener(callback: MediaQueryList['onchange']): void {
    if (!callback) return

    const listener = this.legacyListeners.get(callback)

    if (listener) this.removeEventListener('change', listener)
    this.legacyListeners.delete(callback)
  }

  setMatches(matches: boolean): void {
    if (matches === this.matches) return

    this.matches = matches

    const event = new TestMediaQueryEvent(this)

    this.dispatchEvent(event)
    this.onchange?.call(this, event)
  }
}

const mediaQueries = new Map<string, TestMediaQueryList>()
let dispose: (() => void) | undefined

const getMediaQuery = (query: string): TestMediaQueryList => {
  const result = mediaQueries.get(query)

  if (!result) throw new Error(`Missing media query fixture: ${query}`)

  return result
}

const getElements = () => {
  const sidebar = document.querySelector<HTMLElement>('[data-app-sidebar]')
  const trigger = document.querySelector<HTMLButtonElement>('[data-sidebar-trigger]')
  const close = document.querySelector<HTMLButtonElement>('[data-sidebar-close]')
  const workspace = document.querySelector<HTMLElement>('.app-workspace')
  const firstLink = document.querySelector<HTMLAnchorElement>('[data-first-link]')
  const lastLink = document.querySelector<HTMLAnchorElement>('[data-last-link]')

  if (!sidebar || !trigger || !close || !workspace || !firstLink || !lastLink)
    throw new Error('Navigation fixture is incomplete')

  return { close, firstLink, lastLink, sidebar, trigger, workspace }
}

const pressKey = (key: string, shiftKey = false): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key,
    shiftKey
  })

  document.dispatchEvent(event)

  return event
}

const startNavigation = () => {
  dispose = initializeAppNavigation()

  return getElements()
}

beforeEach(() => {
  vi.useFakeTimers()
  mediaQueries.clear()
  mediaQueries.set(mobileQuery, new TestMediaQueryList(mobileQuery, true))
  mediaQueries.set(reducedMotionQuery, new TestMediaQueryList(reducedMotionQuery, false))
  vi.stubGlobal('matchMedia', vi.fn<(query: string) => MediaQueryList>(getMediaQuery))
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (
    this: HTMLElement
  ): DOMRectList {
    const rectangles = this.dataset.layoutHidden === 'true' ? [] : [new DOMRect(0, 0, 44, 44)]

    return Object.assign(rectangles, {
      item: (index: number): DOMRect | null => rectangles[index] ?? null
    })
  })

  document.body.innerHTML = `
    <aside data-app-sidebar aria-label="Workspace navigation">
      <button disabled>Unavailable</button>
      <button hidden>Hidden action</button>
      <button data-sidebar-close>Close navigation</button>
      <a data-first-link href="/dashboard/">Dashboard</a>
      <a data-last-link href="/settings/">Settings</a>
      <a data-layout-hidden="true" href="/hidden/">Hidden by layout</a>
    </aside>
    <main class="app-workspace">
      <button data-sidebar-trigger aria-expanded="false">Open navigation</button>
      <a href="/store/">Store analytics</a>
    </main>
  `
})

afterEach(() => {
  dispose?.()
  dispose = undefined
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.uiMotion
  document.body.innerHTML = ''
  document.body.className = ''
})

describe('app navigation', () => {
  test('starts with mobile navigation hidden and inert without locking the workspace', () => {
    const { sidebar, trigger, workspace } = startNavigation()

    expect(sidebar.hasAttribute('inert')).toBe(true)
    expect(sidebar.getAttribute('aria-hidden')).toBe('true')
    expect(sidebar.hasAttribute('aria-modal')).toBe(false)
    expect(sidebar.hasAttribute('role')).toBe(false)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(workspace.hasAttribute('inert')).toBe(false)
    expect(document.body.classList.contains('sidebar-open')).toBe(false)
  })

  test('opens a modal navigation and focuses its first available control', () => {
    const { close, sidebar, trigger, workspace } = startNavigation()

    trigger.click()

    expect(sidebar.classList.contains('is-open')).toBe(true)
    expect(sidebar.hasAttribute('inert')).toBe(false)
    expect(sidebar.hasAttribute('aria-hidden')).toBe(false)
    expect(sidebar.getAttribute('role')).toBe('dialog')
    expect(sidebar.getAttribute('aria-modal')).toBe('true')
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(workspace.hasAttribute('inert')).toBe(true)
    expect(document.body.classList.contains('sidebar-open')).toBe(true)
    expect(document.activeElement).toBe(close)
  })

  test('loops Tab and Shift+Tab within visible controls while preserving ordinary tab steps', () => {
    const { close, firstLink, lastLink, trigger } = startNavigation()

    trigger.click()

    expect(pressKey('Tab', true).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(lastLink)
    expect(pressKey('Tab').defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(close)

    firstLink.focus()

    expect(pressKey('Tab').defaultPrevented).toBe(false)
  })

  test('keeps the modal locked through Escape exit and then restores trigger focus', () => {
    const { sidebar, trigger, workspace } = startNavigation()

    trigger.click()

    expect(pressKey('Escape').defaultPrevented).toBe(true)
    expect(sidebar.classList.contains('is-open')).toBe(false)
    expect(sidebar.classList.contains('is-closing')).toBe(true)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    vi.advanceTimersByTime(199)

    expect(workspace.hasAttribute('inert')).toBe(true)
    expect(sidebar.getAttribute('aria-modal')).toBe('true')
    expect(document.body.classList.contains('sidebar-open')).toBe(true)
    expect(document.activeElement).not.toBe(trigger)

    vi.advanceTimersByTime(1)

    expect(sidebar.classList.contains('is-closing')).toBe(false)
    expect(sidebar.hasAttribute('inert')).toBe(true)
    expect(sidebar.getAttribute('aria-hidden')).toBe('true')
    expect(sidebar.hasAttribute('aria-modal')).toBe(false)
    expect(workspace.hasAttribute('inert')).toBe(false)
    expect(document.body.classList.contains('sidebar-open')).toBe(false)
    expect(document.activeElement).toBe(trigger)
  })

  test.each(['system', 'saved'])('closes immediately for %s reduced motion', preference => {
    if (preference === 'system') getMediaQuery(reducedMotionQuery).setMatches(true)
    else document.documentElement.dataset.uiMotion = 'reduce'

    const { close, sidebar, trigger, workspace } = startNavigation()

    trigger.click()
    close.click()

    expect(sidebar.hasAttribute('inert')).toBe(true)
    expect(sidebar.classList.contains('is-closing')).toBe(false)
    expect(workspace.hasAttribute('inert')).toBe(false)
    expect(document.body.classList.contains('sidebar-open')).toBe(false)
    expect(document.activeElement).toBe(trigger)

    vi.advanceTimersByTime(300)

    expect(document.activeElement).toBe(trigger)
    expect(sidebar.classList.contains('is-open')).toBe(false)
  })

  test('cancels the pending exit when navigation reopens', () => {
    const { close, sidebar, trigger, workspace } = startNavigation()

    trigger.click()
    close.click()
    vi.advanceTimersByTime(100)
    trigger.click()
    vi.advanceTimersByTime(300)

    expect(sidebar.classList.contains('is-open')).toBe(true)
    expect(sidebar.classList.contains('is-closing')).toBe(false)
    expect(sidebar.getAttribute('aria-modal')).toBe('true')
    expect(sidebar.hasAttribute('inert')).toBe(false)
    expect(workspace.hasAttribute('inert')).toBe(true)
    expect(document.body.classList.contains('sidebar-open')).toBe(true)
    expect(document.activeElement).toBe(close)
  })

  test('restores desktop navigation on resize and closes it when returning to mobile', () => {
    const { sidebar, trigger, workspace } = startNavigation()

    trigger.click()
    getMediaQuery(mobileQuery).setMatches(false)

    expect(sidebar.classList.contains('is-open')).toBe(false)
    expect(sidebar.hasAttribute('role')).toBe(false)
    expect(sidebar.hasAttribute('aria-modal')).toBe(false)
    expect(sidebar.hasAttribute('aria-hidden')).toBe(false)
    expect(sidebar.hasAttribute('inert')).toBe(false)
    expect(workspace.hasAttribute('inert')).toBe(false)
    expect(document.body.classList.contains('sidebar-open')).toBe(false)

    trigger.click()

    expect(sidebar.classList.contains('is-open')).toBe(false)

    getMediaQuery(mobileQuery).setMatches(true)
    vi.advanceTimersByTime(300)

    expect(sidebar.hasAttribute('inert')).toBe(true)
    expect(sidebar.getAttribute('aria-hidden')).toBe('true')
    expect(document.body.classList.contains('sidebar-open')).toBe(false)
  })

  test('cleans up a pending exit on pagehide before the document is cached', () => {
    const { close, sidebar, trigger, workspace } = startNavigation()

    trigger.click()
    close.click()
    window.dispatchEvent(new Event('pagehide'))

    expect(sidebar.classList.contains('is-open')).toBe(false)
    expect(sidebar.classList.contains('is-closing')).toBe(false)
    expect(sidebar.hasAttribute('inert')).toBe(true)
    expect(sidebar.hasAttribute('aria-modal')).toBe(false)
    expect(workspace.hasAttribute('inert')).toBe(false)
    expect(document.body.classList.contains('sidebar-open')).toBe(false)

    vi.advanceTimersByTime(300)

    expect(document.activeElement).toBe(close)
    expect(sidebar.hasAttribute('inert')).toBe(true)
  })

  test('disposes listeners and the exit timer without allowing navigation to reopen', () => {
    const { close, sidebar, trigger, workspace } = startNavigation()

    trigger.click()
    close.click()
    dispose?.()
    trigger.click()
    getMediaQuery(mobileQuery).setMatches(false)
    close.click()
    window.dispatchEvent(new Event('pagehide'))
    vi.advanceTimersByTime(300)

    expect(sidebar.classList.contains('is-open')).toBe(false)
    expect(sidebar.classList.contains('is-closing')).toBe(false)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(sidebar.hasAttribute('inert')).toBe(true)
    expect(workspace.hasAttribute('inert')).toBe(false)
    expect(document.body.classList.contains('sidebar-open')).toBe(false)
    expect(pressKey('Escape').defaultPrevented).toBe(false)
  })

  test('returns a safe disposer when the current page has no application navigation', () => {
    document.body.innerHTML = '<main>Sign in</main>'
    dispose = initializeAppNavigation()

    expect(() => dispose?.()).not.toThrow()
    expect(document.body.classList.contains('sidebar-open')).toBe(false)
  })
})
