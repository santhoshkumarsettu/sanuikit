import type { HTMLAttributes, ReactNode } from 'react'
export interface LivingDesignProps extends HTMLAttributes<HTMLElement> { title?: string; description?: string; children: ReactNode }
export function LivingDesign({ title = 'Living design system', description, children, className = '', ...props }: LivingDesignProps) { return <main className={`sanui-living-design ${className}`.trim()} {...props}><header>{description && <p>{description}</p>}<h1>{title}</h1></header>{children}</main> }
