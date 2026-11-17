import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { X, LoaderCircle } from "lucide-react";
let openModals = 0;
let previousBodyOverflow = "";
let previousRootOverflow = "";
function lockModalScroll() {
  if (openModals++ === 0) {
    previousBodyOverflow = document.body.style.overflow;
    previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
  }
  return () => {
    if (--openModals === 0) {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
    }
  };
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Status({ value }: { value: string }) {
  return (
    <Badge
      tone={
        /Valid|VALID|Restocked|Verified|Available|Approved|Inspected/.test(
          value,
        )
          ? "success"
          : /Failed|MISMATCH|UNKNOWN|Retired|Rejected|MISSING/.test(value)
            ? "danger"
            : /Pending|Returned|Inspection|Transit/.test(value)
              ? "warning"
              : "neutral"
      }
    >
      {value.replaceAll("_", " ")}
    </Badge>
  );
}
export function PageTitle({
  eyebrow,
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
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="actions">{actions}</div>
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
    <div className="empty">
      <div className="empty-orbit">◇</div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
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
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog.showModal();
    const unlock = lockModalScroll();
    const viewport = window.visualViewport;
    const updateViewport = () => {
      if (!viewport) return;
      dialog.style.setProperty(
        "--modal-viewport-top",
        `${viewport.offsetTop}px`,
      );
      dialog.style.setProperty(
        "--modal-viewport-left",
        `${viewport.offsetLeft}px`,
      );
      dialog.style.setProperty(
        "--modal-viewport-right",
        `${Math.max(0, window.innerWidth - viewport.offsetLeft - viewport.width)}px`,
      );
      dialog.style.setProperty(
        "--modal-viewport-bottom",
        `${Math.max(0, window.innerHeight - viewport.offsetTop - viewport.height)}px`,
      );
      dialog.style.setProperty("--modal-viewport-width", `${viewport.width}px`);
      dialog.style.setProperty(
        "--modal-viewport-height",
        `${viewport.height}px`,
      );
    };
    updateViewport();
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("resize", updateViewport);
    dialog
      .querySelector<HTMLButtonElement>('[aria-label="Close dialog"]')
      ?.focus({ preventScroll: true });
    return () => {
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
      dialog.close();
      unlock();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      aria-labelledby={titleId}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const focusable = [
          ...e.currentTarget.querySelectorAll<HTMLElement>(
            "button,a[href],input,select,textarea,summary,[tabindex]",
          ),
        ].filter(
          (node) =>
            !node.matches(":disabled") &&
            node.tabIndex >= 0 &&
            node.getClientRects().length > 0,
        );
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-top">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          type="button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
export function Busy({
  label = "Loading your workspace…",
}: {
  label?: string;
}) {
  return (
    <div className="loading">
      <LoaderCircle className="spin" size={30} />
      <p>{label}</p>
    </div>
  );
}
export const field = (form: FormData, key: string) =>
  String(form.get(key) ?? "").trim();
