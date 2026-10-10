import type { HTMLAttributes, ReactNode } from 'react'
export interface CollapseProps extends HTMLAttributes<HTMLDivElement> { open: boolean; children: ReactNode }
export function Collapse({ open, children, ...props }: CollapseProps) { return <div hidden={!open} aria-hidden={!open} {...props}>{children}</div> }
