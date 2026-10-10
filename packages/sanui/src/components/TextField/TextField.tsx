import { forwardRef, useId, type InputHTMLAttributes } from 'react'

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
  error?: string
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, id, className = '', ...props }, ref,
) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const messageId = `${inputId}-message`
  return (
    <div className="sanui-field">
      <label className="sanui-field__label" htmlFor={inputId}>{label}</label>
      <input
        ref={ref}
        id={inputId}
        className={`sanui-input${error ? ' sanui-input--error' : ''} ${className}`.trim()}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? messageId : undefined}
        {...props}
      />
      {(error || hint) && <span className={`sanui-field__message${error ? ' sanui-field__message--error' : ''}`} id={messageId}>{error ?? hint}</span>}
    </div>
  )
})
