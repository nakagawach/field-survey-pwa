import type { PointerEvent, ReactNode } from 'react'

type PhotoLibraryPointerDownProps = {
  children: ReactNode
}

type PickerElement = {
  showPicker?: () => void
}

function PhotoLibraryPointerDown({ children }: PhotoLibraryPointerDownProps) {
  const handlePointerDownCapture = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') return

    const target = event.target
    if (!(target instanceof Element)) return

    const select = target.closest('select')
    if (select instanceof HTMLSelectElement) {
      const picker = select as HTMLSelectElement & PickerElement

      if (typeof picker.showPicker === 'function') {
        try {
          picker.showPicker()
          event.preventDefault()
        } catch {
          // Fall back to the browser's normal select handling.
        }
      }

      return
    }

    const label = target.closest(
      '.photo-library-button, .photo-capture-button'
    )
    if (!(label instanceof HTMLLabelElement)) return

    const input = label.querySelector('input[type="file"]')
    if (!(input instanceof HTMLInputElement)) return

    if (typeof input.showPicker !== 'function') {
      return
    }

    try {
      input.showPicker()
      event.preventDefault()
    } catch {
      // Fall back to the label/input's native click behavior.
    }
  }

  return (
    <div onPointerDownCapture={handlePointerDownCapture}>
      {children}
    </div>
  )
}

export default PhotoLibraryPointerDown
