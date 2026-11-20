import { forwardRef, type TextareaHTMLAttributes } from 'react'

export interface TextAreaControlProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const TextAreaControl = forwardRef<HTMLTextAreaElement, TextAreaControlProps>(function TextAreaControl(
  { className = '', ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={`sanui-input sanui-textarea ${className}`.trim()}
      {...props}
    />
  )
})
