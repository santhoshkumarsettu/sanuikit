import type { ButtonHTMLAttributes, ReactNode } from 'react'
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { label: string; children: ReactNode; variant?: 'primary' | 'secondary' | 'ghost' }
export function IconButton({ label, children, variant = 'ghost', className = '', ...props }: IconButtonProps) { return <button type="button" aria-label={label} className={`sanui-icon-button sanui-icon-button--${variant} ${className}`.trim()} {...props}>{children}</button> }
