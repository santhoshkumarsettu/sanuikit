import type { FieldsetHTMLAttributes, ReactNode } from 'react'
export interface FormGroupProps extends FieldsetHTMLAttributes<HTMLFieldSetElement> { label: string; hint?: string; children: ReactNode }
export function FormGroup({ label, hint, children, className = '', ...props }: FormGroupProps) { return <fieldset className={`sanui-form-group ${className}`.trim()} {...props}><legend>{label}</legend>{hint && <p>{hint}</p>}{children}</fieldset> }
