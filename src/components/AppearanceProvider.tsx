import { useEffect, useState, type ReactNode } from "react";
import {
  AppearanceContext,
  appearanceKey,
  readAppearance,
  type Appearance,
} from "../lib/appearance";

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setValue] = useState(readAppearance);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark =
        appearance === "dark" || (appearance === "system" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", dark ? "#18181b" : "#ffffff");
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [appearance]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === appearanceKey || event.key === null)
        setValue(readAppearance());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  function setAppearance(value: Appearance) {
    try {
      localStorage.setItem(appearanceKey, value);
    } catch {
      /* Keep an in-memory preference. */
    }
    setValue(value);
  }
  return (
    <AppearanceContext.Provider value={{ appearance, setAppearance }}>
      {children}
    </AppearanceContext.Provider>
  );
}
