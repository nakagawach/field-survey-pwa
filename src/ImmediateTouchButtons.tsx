import { useEffect } from 'react'
import type { ReactNode } from 'react'

type ImmediateTouchButtonsProps = {
  children: ReactNode
}

function ImmediateTouchButtons({ children }: ImmediateTouchButtonsProps) {
  useEffect(() => {
    let programmaticButton: HTMLButtonElement | null = null
    const suppressNativeClickUntil = new WeakMap<HTMLButtonElement, number>()

    const handlePointerUpCapture = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return

      const target = event.target
      if (!(target instanceof Element)) return

      const button = target.closest('button')
      if (!(button instanceof HTMLButtonElement) || button.disabled) return

      suppressNativeClickUntil.set(button, performance.now() + 700)

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

      const suppressUntil = suppressNativeClickUntil.get(button) ?? 0
      if (performance.now() >= suppressUntil) {
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
