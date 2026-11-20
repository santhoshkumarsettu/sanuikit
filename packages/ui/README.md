# sanui

A thoughtfully designed React component library.

```sh
npm install sanui react react-dom
```

```tsx
import { Button, TextField } from 'sanui'
import 'sanui/styles.css'
```

SanUI exposes design tokens as CSS custom properties prefixed with `--sanui-`. The included Green and Blue brand families are selected with `data-theme-family` on the document root, while `data-theme-mode` controls the light, dark, or system appearance.

```tsx
import { useState } from 'react'
import { ThemeSwitcher, type SanUIThemeFamily } from 'sanui'

function ThemeControl() {
  const [family, setFamily] = useState<SanUIThemeFamily>('green')

  return (
    <ThemeSwitcher
      value={family}
      onChange={nextFamily => {
        setFamily(nextFamily)
        document.documentElement.dataset.themeFamily = nextFamily
      }}
    />
  )
}
```

For a custom application provider, persist the selected family and set both root attributes:

```ts
document.documentElement.dataset.themeMode = 'system' // or 'light' / 'dark'
document.documentElement.dataset.themeFamily = 'blue' // or 'green'
```

The VStudio app includes these controls in its shared shell and Settings page. Its form screens use the exported `Input`, `SelectControl`, and `TextAreaControl` primitives so sizing, focus rings, and colors stay tied to the same token set.

Shared surface tokens keep cards and page backgrounds consistent across the admin and public apps. They derive their colors from the selected family and mode, so applications can change the palette in `tokens.css` without updating each screen:

- `--sanui-color-page-background` — page canvas with subtle brand-tinted light.
- `--sanui-color-card-surface`, `--sanui-color-card-surface-raised`, and `--sanui-color-card-surface-inset` — layered card and nested surface backgrounds.
- `--sanui-color-card-header`, `--sanui-color-card-border`, and `--sanui-color-card-border-hover` — shared card header and edge treatments.
- `--sanui-shadow-card`, `--sanui-shadow-hover`, and `--sanui-radius-card` — shared elevation and shape.
