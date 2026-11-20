import { createContext, useContext } from "react";

export type Appearance = "light" | "dark" | "system";
export const appearanceKey = "rerun:appearance";
export function readAppearance(): Appearance {
  try {
    const value = localStorage.getItem(appearanceKey);
    if (value === "light" || value === "dark") return value;
  } catch {
    /* Storage can be unavailable on shared or restricted devices. */
  }
  return "system";
}
export const AppearanceContext = createContext<{
  appearance: Appearance;
  setAppearance: (value: Appearance) => void;
}>({ appearance: "system", setAppearance: () => {} });
export const useAppearance = () => useContext(AppearanceContext);
