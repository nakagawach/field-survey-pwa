import type { PointerEvent, ReactNode } from 'react'

type PhotoLibraryPointerUpProps = {
  children: ReactNode
}

function PhotoLibraryPointerUp({ children }: PhotoLibraryPointerUpProps) {
  const handlePointerUpCapture = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') return

    const target = event.target
    if (!(target instanceof Element)) return

    const label = target.closest('.photo-library-button')
    if (!(label instanceof HTMLLabelElement)) return

    const input = label.querySelector('input[type="file"]')
    if (!(input instanceof HTMLInputElement)) return

    event.preventDefault()
    input.click()
  }

  return (
    <div onPointerUpCapture={handlePointerUpCapture}>
      {children}
    </div>
  )
}

export default PhotoLibraryPointerUp
