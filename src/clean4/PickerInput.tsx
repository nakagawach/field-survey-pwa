import type { InputHTMLAttributes } from 'react'

type Props = {
  label: string
  className?: string
  inputProps: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'>
  onFiles: (files: File[]) => void | Promise<void>
}

export default function PickerInput({ label, className = '', inputProps, onFiles }: Props) {
  return (
    <label className={`picker-control ${className}`.trim()}>
      <span>{label}</span>
      <input
        {...inputProps}
        type="file"
        onChange={(event) => {
          const input = event.currentTarget
          const files = Array.from(input.files ?? [])
          input.value = ''
          if (files.length > 0) void onFiles(files)
        }}
      />
    </label>
  )
}
