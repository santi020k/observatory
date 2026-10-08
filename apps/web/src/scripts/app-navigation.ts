/** Mobile navigation stays modal until its exit animation has finished. */
export const initializeAppNavigation = (): (() => void) => {
  const sidebar = document.querySelector<HTMLElement>('[data-app-sidebar]')
  const trigger = document.querySelector<HTMLButtonElement>('[data-sidebar-trigger]')
  const workspace = document.querySelector<HTMLElement>('.app-workspace')

  if (!sidebar || !trigger || !workspace) return () => undefined

  const controller = new AbortController()
  const { signal } = controller
  const mobile = window.matchMedia('(max-width: 52rem)')
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  let closingTimer: number | undefined

  const focusableItems = () => [...sidebar.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter(element => !element.hidden && element.getClientRects().length > 0)

  const releaseModal = () => {
    window.clearTimeout(closingTimer)

    sidebar.classList.remove('is-closing')

    document.body.classList.remove('sidebar-open')

    workspace.removeAttribute('inert')

    sidebar.removeAttribute('aria-modal')

    sidebar.removeAttribute('role')

    sidebar.toggleAttribute('inert', mobile.matches)

    if (mobile.matches) sidebar.setAttribute('aria-hidden', 'true')
    else sidebar.removeAttribute('aria-hidden')
  }

  const close = (restoreFocus = false, immediate = false) => {
    const wasOpen = sidebar.classList.contains('is-open')

    sidebar.classList.remove('is-open')

    trigger.setAttribute('aria-expanded', 'false')

    if (!wasOpen && !sidebar.classList.contains('is-closing')) {
      releaseModal()

      return
    }

    const finish = () => {
      releaseModal()

      if (restoreFocus && mobile.matches) trigger.focus({ preventScroll: true })
    }

    window.clearTimeout(closingTimer)

    if (immediate || reducedMotion.matches || document.documentElement.dataset.uiMotion === 'reduce') {
      finish()

      return
    }

    sidebar.classList.add('is-closing')

    closingTimer = window.setTimeout(finish, 200)
  }

  const open = () => {
    if (!mobile.matches) return

    window.clearTimeout(closingTimer)

    sidebar.classList.remove('is-closing')

    sidebar.classList.add('is-open')

    sidebar.removeAttribute('inert')

    sidebar.removeAttribute('aria-hidden')

    sidebar.setAttribute('role', 'dialog')

    sidebar.setAttribute('aria-modal', 'true')

    workspace.setAttribute('inert', '')

    document.body.classList.add('sidebar-open')

    trigger.setAttribute('aria-expanded', 'true')

    focusableItems()[0]?.focus({ preventScroll: true })
  }

  trigger.addEventListener('click', open, { signal })

  for (const button of document.querySelectorAll('[data-sidebar-close]'))
    button.addEventListener('click', () => {
      close(true)
    }, { signal })

  const trapFocus = (event: KeyboardEvent) => {
    const items = focusableItems()
    const first = items[0]
    const last = items[items.length - 1]

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()

      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()

      first?.focus()
    }
  }

  document.addEventListener('keydown', event => {
    if (!mobile.matches || !document.body.classList.contains('sidebar-open')) return

    if (event.key === 'Escape') {
      event.preventDefault()

      close(true)
    } else if (event.key === 'Tab') trapFocus(event)
  }, { signal })

  mobile.addEventListener('change', () => {
    close(false, true)
  }, { signal })

  window.addEventListener('pagehide', () => {
    close(false, true)
  }, { signal })

  releaseModal()

  return () => {
    controller.abort()

    sidebar.classList.remove('is-open')

    trigger.setAttribute('aria-expanded', 'false')

    releaseModal()
  }
}
