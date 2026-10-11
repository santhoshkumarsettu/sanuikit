import type { HTMLAttributes, ReactNode } from 'react'
export interface ErrorMessageProps extends HTMLAttributes<HTMLParagraphElement> { children: ReactNode }
export function ErrorMessage({ className = '', ...props }: ErrorMessageProps) { return <p className={`sanui-error-message ${className}`.trim()} role="alert" {...props} /> }
