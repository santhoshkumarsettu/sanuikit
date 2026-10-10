import type { HTMLAttributes, ReactNode } from 'react'
export interface SnackbarProps extends HTMLAttributes<HTMLDivElement> { open: boolean; children: ReactNode; onClose?: () => void; action?: ReactNode }
export function Snackbar({ open, children, onClose, action, ...props }: SnackbarProps) { if (!open) return null; return <div className="sanui-snackbar" role="status" {...props}><span>{children}</span>{action}{onClose && <button type="button" aria-label="Dismiss notification" onClick={onClose}>×</button>}</div> }
