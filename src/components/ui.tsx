import {
  Empty as UiEmpty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "./ui/empty";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type ComponentProps,
} from "react";
import { cn } from "cn";
import { X, LoaderCircle, ChevronRight } from "lucide-react";
import { Badge as UiBadge } from "./ui/badge";
import { Button, buttonVariants } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "./ui/dialog";
import { Skeleton } from "./ui/skeleton";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <UiBadge
      variant="secondary"
      className={`badge status-badge ${tone}`}
      data-tone={tone}
    >
      {children}
    </UiBadge>
  );
}
export function Status({ value }: { value: string }) {
  const tone =
    /Valid|VALID|Restocked|Verified|Available|Approved|Inspected/.test(value)
      ? "success"
      : /Failed|MISMATCH|UNKNOWN|Retired|Rejected|MISSING/.test(value)
        ? "danger"
        : /Pending|Returned|Inspection|Transit/.test(value)
          ? "warning"
          : "neutral";
  return <Badge tone={tone}>{value.replaceAll("_", " ")}</Badge>;
}
export function PageTitle({
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div className="min-w-0">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <UiEmpty className="empty">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
    </UiEmpty>
  );
}
export function DisclosureTrigger({
  className,
  children,
  ...props
}: ComponentProps<"summary">) {
  return (
    <summary
      className={cn(
        buttonVariants({ variant: "outline" }),
        "disclosure-trigger",
        className,
      )}
      {...props}
    >
      <ChevronRight aria-hidden="true" className="disclosure-chevron" />
      <span className="disclosure-label">{children}</span>
    </summary>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const close = useRef<HTMLButtonElement>(null);
  const [opener] = useState(() =>
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      const root = document.documentElement;
      root.style.setProperty(
        "--modal-viewport-top",
        `${viewport?.offsetTop ?? 0}px`,
      );
      root.style.setProperty(
        "--modal-viewport-left",
        `${viewport?.offsetLeft ?? 0}px`,
      );
      root.style.setProperty(
        "--modal-viewport-width",
        `${viewport?.width ?? innerWidth}px`,
      );
      root.style.setProperty(
        "--modal-viewport-height",
        `${viewport?.height ?? innerHeight}px`,
      );
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return (
    <Dialog
      open
      disablePointerDismissal
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className={wide ? "modal wide" : "modal"}
        showCloseButton={false}
        initialFocus={close}
        finalFocus={() => (opener?.isConnected ? opener : false)}
      >
        <DialogHeader className="modal-top">
          <div>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="sr-only">
              Review {title.toLowerCase()} and use the available actions.
              Changes are saved only when submitted.
            </DialogDescription>
          </div>
          <DialogClose
            render={
              <Button
                ref={close}
                variant="ghost"
                size="icon"
                className="modal-close"
                aria-label="Close dialog"
              />
            }
          >
            <X />
          </DialogClose>
        </DialogHeader>
        <div className="modal-body">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
export function Busy({
  label = "Loading your workspace…",
}: {
  label?: string;
}) {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin size-6 text-primary" />
      <p>{label}</p>
      <div
        aria-hidden="true"
        className="grid w-full max-w-sm grid-cols-2 gap-3"
      >
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="col-span-2 h-32" />
      </div>
    </div>
  );
}
export const field = (form: FormData, key: string) =>
  String(form.get(key) ?? "").trim();
