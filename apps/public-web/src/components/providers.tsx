'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useLayoutEffect, useState, type ReactNode } from 'react'
import type { SanUIThemeFamily } from 'sanui'

type PublicAppearance = {
  family: SanUIThemeFamily
  setFamily: (family: SanUIThemeFamily) => void
}

const PUBLIC_THEME_STORAGE_KEY = 'vstudio.public-theme-family.v1'
const PublicAppearanceContext = createContext<PublicAppearance | null>(null)

function PublicAppearanceProvider({ children }: { children: ReactNode }) {
  const [family, setFamilyState] = useState<SanUIThemeFamily>('green')

  useLayoutEffect(() => {
    let savedFamily: SanUIThemeFamily = 'green'
    try {
      const stored = window.localStorage.getItem(PUBLIC_THEME_STORAGE_KEY)
      if (stored === 'green' || stored === 'blue') savedFamily = stored
    } catch {
      // Use the default theme when browser storage is unavailable.
    }
    setFamilyState(savedFamily)
    document.documentElement.dataset.themeFamily = savedFamily
  }, [])

  const setFamily = useCallback((nextFamily: SanUIThemeFamily) => {
    setFamilyState(nextFamily)
    document.documentElement.dataset.themeFamily = nextFamily
    try {
      window.localStorage.setItem(PUBLIC_THEME_STORAGE_KEY, nextFamily)
    } catch {
      // Keep the selected theme for this session when storage is unavailable.
    }
  }, [])

  return <PublicAppearanceContext.Provider value={{ family, setFamily }}>{children}</PublicAppearanceContext.Provider>
}

export function usePublicAppearance() {
  const appearance = useContext(PublicAppearanceContext)
  if (!appearance) throw new Error('usePublicAppearance must be used within PublicAppearanceProvider.')
  return appearance
}

export function PublicProviders({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } }))
  return <QueryClientProvider client={client}><PublicAppearanceProvider>{children}</PublicAppearanceProvider></QueryClientProvider>
}
