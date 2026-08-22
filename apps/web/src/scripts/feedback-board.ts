const columnSelector = '[data-feedback-column]'
const itemSelector = '[data-feedback-item]'

export const cardMatchesFeedbackFilters = (
  card: HTMLElement,
  query: string,
  type: string,
  moderation: string
): boolean => {
  const searchable = [
    card.dataset.title,
    card.dataset.description,
    card.dataset.email
  ].join(' ').toLowerCase()

  if (query && !searchable.includes(query)) return false

  if (type && card.dataset.type !== type) return false

  if (moderation && card.dataset.moderation !== moderation) return false

  return true
}

export const getAdjacentFeedbackStatus = (
  statuses: readonly string[],
  currentStatus: string,
  direction: -1 | 1,
  rightToLeft = false
): string | undefined => {
  const currentIndex = statuses.indexOf(currentStatus)

  if (currentIndex < 0) return undefined

  return statuses[currentIndex + (rightToLeft ? -direction : direction)]
}

export const initializeFeedbackBoard = (): void => {
  const dashboard = document.querySelector<HTMLElement>('[data-feedback-project]')

  if (!dashboard || dashboard.dataset.feedbackBoardReady === 'true') return

  dashboard.dataset.feedbackBoardReady = 'true'

  const apiUrl = dashboard.dataset.feedbackApi ?? '/api'
  const projectSlug = dashboard.dataset.feedbackProject ?? ''
  const alert = dashboard.querySelector<HTMLElement>('[data-feedback-alert]')
  const board = dashboard.querySelector<HTMLElement>('[data-feedback-board]')
  const search = dashboard.querySelector<HTMLInputElement>('[data-feedback-search]')
  const typeFilter = dashboard.querySelector<HTMLSelectElement>('[data-feedback-type-filter]')
  const moderationFilter = dashboard.querySelector<HTMLSelectElement>('[data-feedback-moderation-filter]')
  const deleteDialog = document.querySelector<HTMLDialogElement>('#delete-feedback-dialog')
  const deleteConfirm = document.querySelector<HTMLButtonElement>('[data-feedback-delete-confirm]')
  let pendingDeleteCard: HTMLElement | null = null

  const itemCards = (): HTMLElement[] => [
    ...dashboard.querySelectorAll<HTMLElement>(itemSelector)
  ]

  const columns = (): HTMLElement[] => [
    ...dashboard.querySelectorAll<HTMLElement>(columnSelector)
  ]

  const showAlert = (message: string, state: 'error' | 'success'): void => {
    if (!alert) return

    alert.textContent = message

    alert.dataset.state = state

    alert.hidden = false

    if (state === 'error') alert.focus()
  }

  const updateCounts = (): void => {
    for (const column of columns()) {
      const visibleItems = column.querySelectorAll<HTMLElement>(
        `${itemSelector}:not([hidden])`
      ).length

      const count = column.querySelector<HTMLElement>('[data-column-count]')
      const empty = column.querySelector<HTMLElement>('[data-column-empty]')

      if (count) count.textContent = String(visibleItems)

      if (empty) empty.hidden = visibleItems > 0
    }

    const total = itemCards().filter(card => !card.hidden).length
    const totalBadge = dashboard.querySelector<HTMLElement>('[data-board-total]')

    if (totalBadge) totalBadge.textContent = `${total} items`
  }

  const applyFilters = (): void => {
    const query = search?.value.trim().toLowerCase() ?? ''
    const type = typeFilter?.value ?? ''
    const moderation = moderationFilter?.value ?? ''

    for (const card of itemCards())
      card.hidden = !cardMatchesFeedbackFilters(card, query, type, moderation)

    updateCounts()
  }

  const updateItem = async (
    id: string,
    change: Record<string, boolean | string>
  ): Promise<void> => {
    const response = await fetch(
      `${apiUrl}/feedback/admin/projects/${encodeURIComponent(projectSlug)}/items/${encodeURIComponent(id)}`, {
        body: JSON.stringify(change),
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH'
      }
    )

    if (!response.ok) throw new Error('Feedback update failed')
  }

  const setCardBusy = (card: HTMLElement, busy: boolean): void => {
    card.setAttribute('aria-busy', String(busy))

    if (busy) card.dataset.state = 'pending'
    else delete card.dataset.state

    for (const control of card.querySelectorAll<HTMLButtonElement | HTMLSelectElement>(
      'button, select'
    )) control.disabled = busy
  }

  const findColumnItems = (status: string): HTMLElement | null => columns()
    .find(column => column.dataset.feedbackColumn === status)
    ?.querySelector<HTMLElement>('[data-column-items]') ?? null

  const getMoveContext = (card: HTMLElement, status: string) => {
    const id = card.dataset.feedbackItem
    const previousParent = card.parentElement
    const target = findColumnItems(status)

    if (!id || !previousParent || !target) return null

    if (card.getAttribute('aria-busy') === 'true') return null

    return {
      id,
      previousNextSibling: card.nextSibling,
      previousParent,
      previousStatus: card.dataset.status ?? 'inbox',
      target
    }
  }

  const moveCard = async (card: HTMLElement, status: string): Promise<boolean> => {
    const context = getMoveContext(card, status)

    if (!context) return false

    if (context.previousStatus === status) return true

    const select = card.querySelector<HTMLSelectElement>('[data-item-status]')

    context.target.prepend(card)

    card.dataset.status = status

    if (select) select.value = status

    setCardBusy(card, true)

    updateCounts()

    try {
      await updateItem(context.id, { status })

      showAlert(`Moved ${card.dataset.title ?? 'feedback'} to ${status.replaceAll('_', ' ')}.`, 'success')

      return true
    } catch {
      context.previousParent.insertBefore(card, context.previousNextSibling)

      card.dataset.status = context.previousStatus

      if (select) select.value = context.previousStatus

      showAlert('Could not update the status. The card was returned to its previous column.', 'error')

      return false
    } finally {
      setCardBusy(card, false)

      updateCounts()
    }
  }

  const updateModeration = async (
    card: HTMLElement,
    id: string,
    moderationStatus: string
  ): Promise<void> => {
    setCardBusy(card, true)

    try {
      await updateItem(id, { moderationStatus })

      card.dataset.moderation = moderationStatus

      const badge = card.querySelector<HTMLElement>('[data-item-moderation-badge]')

      if (badge) badge.textContent = moderationStatus

      applyFilters()

      showAlert('Moderation updated.', 'success')
    } catch {
      const select = card.querySelector<HTMLSelectElement>('[data-item-moderation]')

      if (select) select.value = card.dataset.moderation ?? 'pending'

      showAlert('Could not update moderation.', 'error')
    } finally {
      setCardBusy(card, false)
    }
  }

  const updateVisibility = async (
    card: HTMLElement,
    id: string,
    button: HTMLButtonElement,
    isPublic: boolean
  ): Promise<void> => {
    setCardBusy(card, true)

    try {
      await updateItem(id, { isPublic })

      button.textContent = isPublic ? 'Make private' : 'Make public'

      showAlert(`Feedback is now ${isPublic ? 'public' : 'private'}.`, 'success')
    } catch {
      showAlert('Could not update visibility.', 'error')
    } finally {
      setCardBusy(card, false)
    }
  }

  const bindFilters = (): void => {
    for (const control of [search, typeFilter, moderationFilter])
      control?.addEventListener(control === search ? 'input' : 'change', applyFilters)
  }

  const bindCards = (): void => {
    for (const card of itemCards()) {
      const id = card.dataset.feedbackItem
      const handle = card.querySelector<HTMLButtonElement>('[data-feedback-drag-handle]')

      if (!id) continue

      const bindHandle = (): void => {
        let pointer: {
          active: boolean
          pointerId: number
          startX: number
          startY: number
        } | undefined

        handle?.addEventListener('dragstart', event => {
          if (card.getAttribute('aria-busy') === 'true') {
            event.preventDefault()

            return
          }

          event.dataTransfer?.setData('text/plain', id)

          if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'

          card.classList.add('is-dragging')
        })

        handle?.addEventListener('dragend', () => {
          card.classList.remove('is-dragging')
        })

        handle?.addEventListener('pointerdown', event => {
          if (event.pointerType === 'mouse' || card.getAttribute('aria-busy') === 'true') return

          pointer = {
            active: false,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY
          }
        })

        handle?.addEventListener('pointermove', event => {
          if (pointer?.pointerId !== event.pointerId) return

          const distance = Math.hypot(
            event.clientX - pointer.startX, event.clientY - pointer.startY
          )

          if (!pointer.active && distance < 8) return

          pointer.active = true

          handle.setPointerCapture(event.pointerId)

          card.classList.add('is-dragging')

          const target = document.elementFromPoint(event.clientX, event.clientY)
            ?.closest<HTMLElement>(columnSelector)

          for (const column of columns())
            column.classList.toggle('is-drag-over', column === target)
        })

        handle?.addEventListener('pointerup', event => {
          if (pointer?.pointerId !== event.pointerId) return

          const target = document.elementFromPoint(event.clientX, event.clientY)
            ?.closest<HTMLElement>(columnSelector)

          const status = target?.dataset.feedbackColumn
          const shouldMove = pointer.active && status

          pointer = undefined

          card.classList.remove('is-dragging')

          for (const column of columns()) column.classList.remove('is-drag-over')

          if (shouldMove) moveCard(card, status).catch(() => undefined)
        })

        handle?.addEventListener('pointercancel', () => {
          pointer = undefined

          card.classList.remove('is-dragging')

          for (const column of columns()) column.classList.remove('is-drag-over')
        })

        handle?.addEventListener('keydown', event => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return

          const status = card.dataset.status ?? 'inbox'
          const statusValues = columns().map(column => column.dataset.feedbackColumn ?? '')
          const direction = event.key === 'ArrowRight' ? 1 : -1

          const targetStatus = getAdjacentFeedbackStatus(
            statusValues, status, direction, board ? getComputedStyle(board).direction === 'rtl' : false
          )

          if (!targetStatus) return

          event.preventDefault()

          moveCard(card, targetStatus).catch(() => undefined)
        })
      }

      bindHandle()

      card.querySelector<HTMLSelectElement>('[data-item-status]')?.addEventListener('change', event => {
        const select = event.currentTarget

        if (select instanceof HTMLSelectElement)
          moveCard(card, select.value).catch(() => undefined)
      })

      card.querySelector<HTMLSelectElement>('[data-item-moderation]')?.addEventListener('change', event => {
        const select = event.currentTarget

        if (select instanceof HTMLSelectElement)
          updateModeration(card, id, select.value).catch(() => undefined)
      })

      card.querySelector<HTMLButtonElement>('[data-item-visibility]')?.addEventListener('click', event => {
        const button = event.currentTarget

        if (!(button instanceof HTMLButtonElement)) return

        updateVisibility(
          card, id, button, button.textContent.trim() === 'Make public'
        ).catch(() => undefined)
      })

      card.querySelector<HTMLButtonElement>('[data-item-delete]')?.addEventListener('click', () => {
        pendingDeleteCard = card

        deleteDialog?.showModal()
      })
    }
  }

  const deleteFeedback = async (): Promise<void> => {
    const card = pendingDeleteCard
    const id = card?.dataset.feedbackItem

    if (!card || !id) return

    const response = await fetch(
      `${apiUrl}/feedback/admin/projects/${encodeURIComponent(projectSlug)}/items/${encodeURIComponent(id)}`, {
        credentials: 'include',
        method: 'DELETE'
      }
    )

    if (!response.ok) {
      deleteDialog?.close()

      showAlert('Could not delete the feedback item.', 'error')

      return
    }

    card.remove()

    pendingDeleteCard = null

    deleteDialog?.close()

    updateCounts()

    showAlert('Feedback item deleted.', 'success')
  }

  const bindDelete = (): void => {
    deleteConfirm?.addEventListener('click', () => {
      deleteFeedback().catch(() => undefined)
    })
  }

  const bindColumns = (): void => {
    for (const column of columns()) {
      column.addEventListener('dragover', event => {
        event.preventDefault()

        column.classList.add('is-drag-over')

        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
      })

      column.addEventListener('dragleave', event => {
        if (event.relatedTarget instanceof Node && column.contains(event.relatedTarget)) return

        column.classList.remove('is-drag-over')
      })

      column.addEventListener('drop', event => {
        event.preventDefault()

        column.classList.remove('is-drag-over')

        const id = event.dataTransfer?.getData('text/plain')
        const status = column.dataset.feedbackColumn
        const card = itemCards().find(item => item.dataset.feedbackItem === id)

        if (card && status) moveCard(card, status).catch(() => undefined)
      })
    }
  }

  const bindBoard = (): void => {
    board?.addEventListener('keydown', event => {
      if (event.target !== board) return

      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return

      event.preventDefault()

      board.scrollBy({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        left: event.key === 'ArrowRight' ? board.clientWidth * 0.8 : board.clientWidth * -0.8
      })
    })
  }

  bindFilters()

  bindCards()

  bindDelete()

  bindColumns()

  bindBoard()

  updateCounts()
}
