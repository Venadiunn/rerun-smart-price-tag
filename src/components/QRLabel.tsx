import { Button } from "@/components/ui/button";
import { useEffect, useRef } from "react";
import QrCreator from "qr-creator";

import { download } from "../lib/api";
export function QRLabel({ value, label }: { value: string; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const qr = document.createElement("canvas");
    QrCreator.render(
      {
        text: value,
        radius: 0,
        ecLevel: "M",
        fill: "#141927",
        background: "#ffffff",
        size: 240,
      },
      qr,
    );
    ref.current.width = 336;
    ref.current.height = 336;
    const context = ref.current.getContext("2d")!;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 336, 336);
    context.drawImage(qr, 48, 48);
  }, [value]);
  return (
    <div className="qr-label">
      <div className="qr-paper">
        <canvas ref={ref} aria-label={`QR code for ${label}`} />
        <strong>{label}</strong>
        <small>ReRun · Scan to look up</small>
      </div>
      <div className="actions">
        <Button
          type="button"
          className="secondary"
          onClick={() =>
            ref.current?.toBlob(async (b) => {
              if (b)
                download(await b.arrayBuffer(), `${label}.png`, "image/png");
            })
          }
        >
          PNG
        </Button>
        <Button
          type="button"
          className="secondary"
          onClick={() => {
            const win = window.open("", "_blank");
            if (!win) return;
            win.document.title = "ReRun label";
            const img = win.document.createElement("img");
            img.src = ref.current!.toDataURL();
            img.style.width = "40mm";
            const text = win.document.createElement("p");
            text.textContent = label;
            win.document.body.append(img, text);
            img.onload = () => win.print();
          }}
        >
          Print
        </Button>
      </div>
    </div>
  );
}
