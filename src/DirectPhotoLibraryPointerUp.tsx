import { useEffect } from 'react'

function DirectPhotoLibraryPointerUp() {
  useEffect(() => {
    const attached = new Map<HTMLLabelElement, (event: PointerEvent) => void>()

    const attach = () => {
      document
        .querySelectorAll<HTMLLabelElement>('.photo-library-button')
        .forEach((label) => {
          if (attached.has(label)) return

          const handlePointerUp = (event: PointerEvent) => {
            if (event.pointerType === 'mouse') return

            const input = label.querySelector<HTMLInputElement>('input[type="file"]')
            if (!input) return

            if (typeof input.showPicker === 'function') {
              input.showPicker()
            } else {
              input.click()
            }

            event.preventDefault()
          }

          label.addEventListener('pointerup', handlePointerUp)
          attached.set(label, handlePointerUp)
        })
    }

    attach()

    const observer = new MutationObserver(attach)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      attached.forEach((handler, label) => {
        label.removeEventListener('pointerup', handler)
      })
      attached.clear()
    }
  }, [])

  return null
}

export default DirectPhotoLibraryPointerUp
