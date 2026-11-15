"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";

export type ThemeMode = "system" | "light" | "dark" | "custom";
export type ThemeFamily = "green" | "blue";

type Appearance = {
  mode: ThemeMode;
  family: ThemeFamily;
};

type AppearanceContextValue = Appearance & {
  setMode: (mode: ThemeMode) => void;
  setFamily: (family: ThemeFamily) => void;
};

const STORAGE_KEY = "vstudio.appearance.v1";
const DEFAULT_APPEARANCE: Appearance = { mode: "system", family: "green" };

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function isThemeMode(value: unknown): value is ThemeMode {
  return (
    value === "system" ||
    value === "light" ||
    value === "dark" ||
    value === "custom"
  );
}

function isThemeFamily(value: unknown): value is ThemeFamily {
  return value === "green" || value === "blue";
}

function applyAppearance(appearance: Appearance) {
  const root = document.documentElement;
  root.dataset.themeMode = appearance.mode;
  root.dataset.themeFamily = appearance.family;
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE);

  useLayoutEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          "mode" in parsed &&
          "family" in parsed
        ) {
          const value = parsed as { mode: unknown; family: unknown };
          const mode = isThemeMode(value.mode)
            ? value.mode
            : DEFAULT_APPEARANCE.mode;
          const restored = {
            mode,
            family:
              mode === "custom" && isThemeFamily(value.family)
                ? value.family
                : DEFAULT_APPEARANCE.family,
          };
          setAppearance(restored);
          applyAppearance(restored);
          return;
        }
      }
    } catch {
      // Keep the default appearance when local storage is blocked or malformed.
    }

    applyAppearance(DEFAULT_APPEARANCE);
  }, []);

  const updateAppearance = useCallback((next: Appearance) => {
    setAppearance(next);
    applyAppearance(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // The selected theme still applies for this session when storage is unavailable.
    }
  }, []);

  const setMode = useCallback(
    (mode: ThemeMode) => {
      updateAppearance({
        mode,
        family:
          mode === "custom" ? appearance.family : DEFAULT_APPEARANCE.family,
      });
    },
    [appearance, updateAppearance],
  );

  const setFamily = useCallback(
    (family: ThemeFamily) => {
      updateAppearance({ ...appearance, family });
    },
    [appearance, updateAppearance],
  );

  return (
    <AppearanceContext.Provider value={{ ...appearance, setMode, setFamily }}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context)
    throw new Error("useAppearance must be used within AppearanceProvider.");
  return context;
}
