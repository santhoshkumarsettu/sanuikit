import { forwardRef, useId, type SelectHTMLAttributes } from 'react'

export type SanUIThemeFamily = 'green' | 'blue'

export interface ThemeSwitcherProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'> {
  value: SanUIThemeFamily
  onChange: (family: SanUIThemeFamily) => void
  label?: string
}

export const ThemeSwitcher = forwardRef<HTMLSelectElement, ThemeSwitcherProps>(function ThemeSwitcher(
  { value, onChange, label = 'Theme', className = '', id, ...props },
  ref,
) {
  const generatedId = useId()
  const selectId = id ?? generatedId

  return (
    <label className={`sanui-theme-switcher ${className}`.trim()} htmlFor={selectId}>
      <span className="sanui-theme-switcher__label">{label}</span>
      <span className="sanui-theme-switcher__select-wrap">
        <select
          {...props}
          ref={ref}
          id={selectId}
          className="sanui-theme-switcher__select"
          aria-label={props['aria-label'] ?? label}
          value={value}
          onChange={event => onChange(event.target.value as SanUIThemeFamily)}
        >
          <option value="green">Green</option>
          <option value="blue">Blue</option>
        </select>
        <span className="sanui-theme-switcher__chevron" aria-hidden="true">⌄</span>
      </span>
    </label>
  )
})
