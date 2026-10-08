// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'

import {
  cardMatchesFeedbackFilters,
  getAdjacentFeedbackStatus,
  initializeFeedbackBoard
} from './feedback-board'

const renderBoard = (): void => {
  document.body.innerHTML = `
    <main data-feedback-api="/api" data-feedback-project="postlens">
      <div data-feedback-alert hidden tabindex="-1"></div>
      <span data-board-total></span>
      <section data-feedback-filters><p role="status"></p></section>
      <input data-feedback-search>
      <select data-feedback-type-filter><option value=""></option></select>
      <select data-feedback-moderation-filter><option value=""></option></select>
      <div data-feedback-board tabindex="0">
        <section data-feedback-column="inbox">
          <span data-column-count></span>
          <div data-column-items>
            <article
              data-description="A useful idea"
              data-email="person@example.com"
              data-feedback-item="feedback-1"
              data-moderation="pending"
              data-status="inbox"
              data-title="Improve exports"
              data-type="idea"
            >
              <button data-feedback-drag-handle>Move</button>
              <select data-item-status>
                <option value="inbox">Inbox</option>
                <option value="planned">Planned</option>
              </select>
            </article>
            <div data-column-empty hidden>Empty</div>
          </div>
        </section>
        <section data-feedback-column="planned">
          <span data-column-count></span>
          <div data-column-items><div data-column-empty>Empty</div></div>
        </section>
      </div>
    </main>
    <dialog id="delete-feedback-dialog"></dialog>
    <button data-feedback-delete-confirm>Delete</button>
  `
}

const flushPromises = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  vi.restoreAllMocks()
  renderBoard()
})

describe('feedback board', () => {
  test('matches cards using text, type, and moderation filters', () => {
    const card = document.querySelector<HTMLElement>('[data-feedback-item]')

    expect(card).not.toBeNull()
    if (!card) return

    expect(cardMatchesFeedbackFilters(card, 'exports', 'idea', 'pending')).toBe(true)
    expect(cardMatchesFeedbackFilters(card, 'missing', 'idea', 'pending')).toBe(false)
  })

  test('announces filtered results and restores the full board when search is cleared', () => {
    initializeFeedbackBoard()

    const search = document.querySelector<HTMLInputElement>('[data-feedback-search]')
    const results = document.querySelector('[data-feedback-filters] [role="status"]')
    const card = document.querySelector<HTMLElement>('[data-feedback-item]')

    expect(results?.textContent).toBe('1 item')

    if (!search) throw new Error('Feedback search fixture is missing')

    search.value = 'unmatched'
    search.dispatchEvent(new Event('input', { bubbles: true }))

    expect(card?.hidden).toBe(true)
    expect(results?.textContent).toBe('0 items')
    expect(document.querySelector('[data-board-total]')?.textContent).toBe('0 items')

    search.value = ''
    search.dispatchEvent(new Event('input', { bubbles: true }))

    expect(card?.hidden).toBe(false)
    expect(results?.textContent).toBe('1 item')
  })

  test('resolves keyboard movement in LTR and RTL order', () => {
    const statuses = ['inbox', 'planned', 'released']

    expect(getAdjacentFeedbackStatus(statuses, 'planned', 1)).toBe('released')
    expect(getAdjacentFeedbackStatus(statuses, 'planned', 1, true)).toBe('inbox')
  })

  test('optimistically moves, exposes busy state, and announces success without stealing focus', async () => {
    let finishRequest: ((response: { ok: boolean }) => void) | undefined

    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => {
      finishRequest = resolve
    })))
    initializeFeedbackBoard()

    const card = document.querySelector<HTMLElement>('[data-feedback-item]')
    const select = card?.querySelector<HTMLSelectElement>('[data-item-status]')
    const plannedItems = document.querySelector<HTMLElement>(
      '[data-feedback-column="planned"] [data-column-items]'
    )

    select?.focus()
    if (select) {
      select.value = 'planned'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    }

    expect(card?.parentElement).toBe(plannedItems)
    expect(card?.getAttribute('aria-busy')).toBe('true')

    finishRequest?.({ ok: true })
    await flushPromises()

    expect(card?.getAttribute('aria-busy')).toBe('false')
    expect(document.querySelector('[data-feedback-alert]')?.textContent).toContain('Moved Improve exports')
    expect(document.activeElement).not.toBe(document.querySelector('[data-feedback-alert]'))
  })

  test('rolls a rejected keyboard move back and focuses the error', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false })))
    initializeFeedbackBoard()

    const card = document.querySelector<HTMLElement>('[data-feedback-item]')
    const handle = card?.querySelector<HTMLButtonElement>('[data-feedback-drag-handle]')
    const inboxItems = document.querySelector<HTMLElement>(
      '[data-feedback-column="inbox"] [data-column-items]'
    )
    const alert = document.querySelector<HTMLElement>('[data-feedback-alert]')

    handle?.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'ArrowRight'
    }))
    await flushPromises()

    expect(card?.parentElement).toBe(inboxItems)
    expect(card?.dataset.status).toBe('inbox')
    expect(alert?.textContent).toContain('returned to its previous column')
    expect(document.activeElement).toBe(alert)
  })
})
