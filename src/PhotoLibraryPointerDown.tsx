import type { PointerEvent, ReactNode } from 'react'

type PhotoLibraryPointerDownProps = {
  children: ReactNode
}

function PhotoLibraryPointerDown({ children }: PhotoLibraryPointerDownProps) {
  const handlePointerDownCapture = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') return

    const target = event.target
    if (!(target instanceof Element)) return

    const label = target.closest('.photo-library-button')
    if (!(label instanceof HTMLLabelElement)) return

    const input = label.querySelector('input[type="file"]')
    if (!(input instanceof HTMLInputElement)) return

    try {
      if (typeof input.showPicker === 'function') {
        input.showPicker()
      } else {
        input.click()
      }

      event.preventDefault()
    } catch {
      input.click()
      event.preventDefault()
    }
  }

  return (
    <div onPointerDownCapture={handlePointerDownCapture}>
      {children}
    </div>
  )
}

export default PhotoLibraryPointerDown
