import { forwardRef, type InputHTMLAttributes } from 'react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className = '', type = 'text', ...props },
  ref,
) {
  const isChoice = type === 'checkbox' || type === 'radio'
  const controlClass = isChoice
    ? `sanui-choice__control sanui-choice__control--${type}`
    : 'sanui-input'

  return (
    <input
      ref={ref}
      type={type}
      className={`${controlClass} ${className}`.trim()}
      {...props}
    />
  )
})
