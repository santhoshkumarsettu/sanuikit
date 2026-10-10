import type { HTMLAttributes, ReactNode } from 'react'
export interface ListProps extends HTMLAttributes<HTMLUListElement> { items?: ReactNode[]; ordered?: boolean; children?: ReactNode }
export function List({ items, ordered = false, children, className = '', ...props }: ListProps) { const Element = ordered ? 'ol' : 'ul'; return <Element className={`sanui-list ${className}`.trim()} {...props}>{items ? items.map((item, index) => <li key={index}>{item}</li>) : children}</Element> }
