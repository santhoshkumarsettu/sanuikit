import { useEffect, useRef, type HTMLAttributes, type ReactNode } from 'react'

export interface FocusTrapProps extends HTMLAttributes<HTMLDivElement> {
  active?: boolean
  children: ReactNode
}

export function FocusTrap({ active = true, children, ...props }: FocusTrapProps) {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active || !root.current) return

    const previous = document.activeElement as HTMLElement | null
    const getItems = () => Array.from(
      root.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    )

    getItems()[0]?.focus({ preventScroll: true })

    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const items = getItems()
      if (!items.length) {
        event.preventDefault()
        root.current?.focus({ preventScroll: true })
        return
      }

      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus({ preventScroll: true })
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus({ preventScroll: true })
      }
    }

    document.addEventListener('keydown', keydown)
    return () => {
      document.removeEventListener('keydown', keydown)
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [active])

  return (
    <div ref={root} tabIndex={-1} {...props}>
      {children}
    </div>
  )
}
