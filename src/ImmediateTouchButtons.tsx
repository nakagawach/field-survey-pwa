import { useEffect } from 'react'
import type { ReactNode } from 'react'

type ImmediateTouchButtonsProps = {
  children: ReactNode
}

function ImmediateTouchButtons({ children }: ImmediateTouchButtonsProps) {
  useEffect(() => {
    let programmaticButton: HTMLButtonElement | null = null
    let suppressNativeClickUntil = 0

    const handlePointerUpCapture = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return

      const target = event.target
      if (!(target instanceof Element)) return

      const button = target.closest('button')
      if (!(button instanceof HTMLButtonElement) || button.disabled) return

      // button.click() may synchronously replace the screen. The browser's later
      // synthesized click can then be hit-tested against a different button on
      // that new screen, so suppress that native click regardless of its target.
      suppressNativeClickUntil = performance.now() + 700

      programmaticButton = button
      button.click()
      programmaticButton = null
    }

    const handleClickCapture = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return

      const button = target.closest('button')
      if (!(button instanceof HTMLButtonElement)) return

      if (programmaticButton === button) {
        return
      }

      if (performance.now() >= suppressNativeClickUntil) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    }

    document.addEventListener('pointerup', handlePointerUpCapture, true)
    document.addEventListener('click', handleClickCapture, true)

    return () => {
      document.removeEventListener('pointerup', handlePointerUpCapture, true)
      document.removeEventListener('click', handleClickCapture, true)
    }
  }, [])

  return <>{children}</>
}

export default ImmediateTouchButtons
