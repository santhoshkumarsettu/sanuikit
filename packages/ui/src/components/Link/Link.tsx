import type { AnchorHTMLAttributes } from 'react'
export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> { external?: boolean }
export function Link({ external = false, className = '', target, rel, ...props }: LinkProps) { const finalTarget = external ? target ?? '_blank' : target; return <a className={`sanui-link ${className}`.trim()} target={finalTarget} rel={external ? rel ?? 'noreferrer' : rel} {...props} /> }
