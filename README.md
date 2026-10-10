# SanUI

SanUI is a React component library developed alongside a Vite playground. The publishable package lives in `packages/sanui`; the app at the repository root previews the library through its workspace package name.

## Develop

```sh
npm install
npm run dev
```

The dev command builds the library first, then starts the playground. When changing library components, rerun the build or use the package build command in another terminal before refreshing the playground.

## Build

```sh
npm run build
```

This builds the SanUI package, emits its TypeScript declarations, and builds the playground. To inspect the package contents before publishing, run `npm pack --workspace sanui --dry-run`.

## Package use

```tsx
import { Button, TextField } from 'sanui'
import 'sanui/styles.css'
```

The component catalog includes the requested foundations and controls, including `A11yAnnouncement`, `Alert`, `Banner`, `BottomSheet`, `Button`, `DataTable`, form controls, navigation, overlays, feedback components, `Wizard`, hooks, and utilities. Each component has its own folder under `packages/sanui/src/components/<ComponentName>/`; add its export to `packages/sanui/src/index.ts`.
