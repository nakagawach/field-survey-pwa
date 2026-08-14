import type { MouseEvent, PointerEvent, ReactNode } from 'react'

let allowProgrammaticClick = false
let suppressNativeClickUntil = 0

type ImmediateTouchButtonsProps = {
  children: ReactNode
}

function ImmediateTouchButtons({ children }: ImmediateTouchButtonsProps) {
  const handlePointerUpCapture = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') return

    const target = event.target
    if (!(target instanceof Element)) return

    const button = target.closest('button')
    if (!(button instanceof HTMLButtonElement) || button.disabled) return

    suppressNativeClickUntil = performance.now() + 700
    allowProgrammaticClick = true
    button.click()
    allowProgrammaticClick = false
  }

  const handleClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (allowProgrammaticClick || performance.now() >= suppressNativeClickUntil) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <div onPointerUpCapture={handlePointerUpCapture} onClickCapture={handleClickCapture}>
      {children}
    </div>
  )
}

export default ImmediateTouchButtons
