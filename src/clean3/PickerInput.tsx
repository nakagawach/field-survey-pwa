import type { ChangeEvent, InputHTMLAttributes, PointerEvent } from 'react'

type Props = {
  label: string
  className?: string
  inputProps: InputHTMLAttributes<HTMLInputElement>
  onFiles: (files: File[]) => void | Promise<void>
}

export default function PickerInput({ label, className = '', inputProps, onFiles }: Props) {
  const handlePointerDown = (event: PointerEvent<HTMLInputElement>) => {
    if (event.pointerType === 'mouse') return
    const input = event.currentTarget
    if (typeof input.showPicker !== 'function') return
    try {
      input.showPicker()
      event.preventDefault()
    } catch {
      // 未対応・拒否時はinput本来のnative pickerへfallbackする。
    }
  }

  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const files = Array.from(input.files ?? [])
    input.value = ''
    if (files.length > 0) await onFiles(files)
  }

  return (
    <label className={`picker-control ${className}`.trim()}>
      <span>{label}</span>
      <input
        {...inputProps}
        type="file"
        onPointerDown={handlePointerDown}
        onChange={handleChange}
      />
    </label>
  )
}
