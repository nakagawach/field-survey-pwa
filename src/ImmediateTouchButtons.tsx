import { useEffect } from 'react'
import type { ReactNode } from 'react'

type ImmediateTouchButtonsProps = {
  children: ReactNode
}

function ImmediateTouchButtons({ children }: ImmediateTouchButtonsProps) {
  useEffect(() => {
    let programmaticButton: HTMLButtonElement | null = null

    const handlePointerUpCapture = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return

      const target = event.target
      if (!(target instanceof Element)) return

      const button = target.closest('button')
      if (!(button instanceof HTMLButtonElement) || button.disabled) return

      // AndroidではPhotoSwipeの下スワイプclose直後に、ブラウザが次の
      // synthetic clickを無視することがあるためpointerupで即時activateする。
      // 同じ操作から後続clickが合成されないよう、このpointerup自体を
      // preventDefaultして、時間ベースのclick抑止は使わない。
      event.preventDefault()

      programmaticButton = button
      try {
        button.click()
      } finally {
        programmaticButton = null
      }
    }

    const handleClickCapture = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return

      const button = target.closest('button')
      if (!(button instanceof HTMLButtonElement)) return

      // pointerup内で明示的に発火したclickだけは通常どおり通す。
      if (programmaticButton === button) return
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
