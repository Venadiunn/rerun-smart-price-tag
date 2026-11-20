import { cn } from "../lib/utils";

export function Brand({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <a
      href="/"
      aria-label="ReRun overview"
      className={cn("rerun-brand", compact && "rerun-brand-compact", className)}
    >
      <img src="/rerun-logo.png" alt="ReRun" width="52" height="42" />
    </a>
  );
}
