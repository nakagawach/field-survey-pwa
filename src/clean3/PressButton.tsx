import { useRef } from 'react'
import type { ButtonHTMLAttributes, PointerEvent } from 'react'

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {
  onPress: () => void
}

export default function PressButton({ onPress, disabled, ...props }: Props) {
  const startRef = useRef<{ id: number; x: number; y: number } | null>(null)

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled || event.button !== 0) return
    startRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
  }

  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const start = startRef.current
    startRef.current = null
    if (disabled || !start || start.id !== event.pointerId) return
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 14) return
    onPress()
  }

  return (
    <button
      {...props}
      type={props.type ?? 'button'}
      disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { startRef.current = null }}
      onClick={(event) => {
        // Pointer操作はpointerupで一度だけ実行。detail=0はkeyboard/支援技術用。
        if (event.detail === 0 && !disabled) onPress()
      }}
    />
  )
}
