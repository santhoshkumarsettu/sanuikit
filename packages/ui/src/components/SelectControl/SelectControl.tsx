import { forwardRef, type SelectHTMLAttributes } from 'react'

export interface SelectControlProps extends SelectHTMLAttributes<HTMLSelectElement> {}

export const SelectControl = forwardRef<HTMLSelectElement, SelectControlProps>(function SelectControl(
  { className = '', ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={`sanui-input sanui-select ${className}`.trim()}
      {...props}
    />
  )
})
