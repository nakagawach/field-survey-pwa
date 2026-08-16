import type { SelectHTMLAttributes, PointerEvent } from 'react'

type Props = SelectHTMLAttributes<HTMLSelectElement>

export default function PickerSelect(props: Props) {
  const onPointerDown = (event: PointerEvent<HTMLSelectElement>) => {
    props.onPointerDown?.(event)
    if (event.defaultPrevented || event.pointerType === 'mouse') return
    const select = event.currentTarget as HTMLSelectElement & { showPicker?: () => void }
    if (typeof select.showPicker !== 'function') return
    try {
      select.showPicker()
      event.preventDefault()
    } catch {
      // native selectへfallback
    }
  }

  return <select {...props} onPointerDown={onPointerDown} />
}
