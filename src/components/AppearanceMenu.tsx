import { Check, Moon, Sun } from "lucide-react";
import { useAppearance, type Appearance } from "../lib/appearance";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";

export function AppearanceMenu() {
  const { appearance, setAppearance } = useAppearance();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Change appearance" />
        }
      >
        <Sun className="dark:hidden" />
        <Moon className="hidden dark:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-40"
        aria-label="Appearance"
      >
        {(
          [
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
            { value: "system", label: "System" },
          ] as const
        ).map(({ value, label }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setAppearance(value as Appearance)}
            aria-current={appearance === value ? "true" : undefined}
          >
            <span className="flex-1">{label}</span>
            {appearance === value && <Check aria-hidden="true" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
