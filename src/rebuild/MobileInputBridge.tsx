import { useEffect } from 'react'
import type { ReactNode } from 'react'

type Props = { children: ReactNode }
type PickerElement = HTMLElement & { showPicker?: () => void }

type ActiveTap = {
  pointerId: number
  button: HTMLButtonElement
  x: number
  y: number
}

const TAP_MOVE_LIMIT = 14

function MobileInputBridge({ children }: Props) {
  useEffect(() => {
    let activeTap: ActiveTap | null = null
    let bridgeButton: HTMLButtonElement | null = null
    let suppressNextTrustedClick = false

    const clearSuppressionForNewGesture = () => {
      suppressNextTrustedClick = false
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return

      clearSuppressionForNewGesture()

      const target = event.target
      if (!(target instanceof Element)) return

      const select = target.closest('select')
      if (select instanceof HTMLSelectElement) {
        const picker = select as PickerElement
        if (typeof picker.showPicker === 'function') {
          try {
            picker.showPicker()
            event.preventDefault()
          } catch {
            // Native select behavior is the fallback.
          }
        }
        return
      }

      const fileInput = target.closest('input[type="file"]')
      if (fileInput instanceof HTMLInputElement) {
        const picker = fileInput as PickerElement
        if (typeof picker.showPicker === 'function') {
          try {
            picker.showPicker()
            event.preventDefault()
          } catch {
            // Native file-input behavior is the fallback.
          }
        }
        return
      }

      const button = target.closest('button')
      if (!(button instanceof HTMLButtonElement) || button.disabled) return

      activeTap = {
        pointerId: event.pointerId,
        button,
        x: event.clientX,
        y: event.clientY,
      }
    }

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return

      const tap = activeTap
      activeTap = null
      if (!tap || tap.pointerId !== event.pointerId) return
      if (!tap.button.isConnected || tap.button.disabled) return

      const moved = Math.hypot(event.clientX - tap.x, event.clientY - tap.y)
      if (moved > TAP_MOVE_LIMIT) return

      const target = event.target
      if (!(target instanceof Element) || target.closest('button') !== tap.button) return

      event.preventDefault()
      event.stopPropagation()

      suppressNextTrustedClick = true
      bridgeButton = tap.button
      try {
        tap.button.click()
      } finally {
        bridgeButton = null
      }
    }

    const handlePointerCancel = (event: PointerEvent) => {
      if (activeTap?.pointerId === event.pointerId) activeTap = null
    }

    const handleClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const button = target.closest('button')

      if (button instanceof HTMLButtonElement && button === bridgeButton) {
        return
      }

      if (suppressNextTrustedClick && event.isTrusted) {
        suppressNextTrustedClick = false
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
      }
    }

    const handleKeyDown = () => {
      suppressNextTrustedClick = false
      activeTap = null
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('pointerup', handlePointerUp, true)
    document.addEventListener('pointercancel', handlePointerCancel, true)
    document.addEventListener('click', handleClick, true)
    document.addEventListener('keydown', handleKeyDown, true)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('pointerup', handlePointerUp, true)
      document.removeEventListener('pointercancel', handlePointerCancel, true)
      document.removeEventListener('click', handleClick, true)
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [])

  return <>{children}</>
}

export default MobileInputBridge
