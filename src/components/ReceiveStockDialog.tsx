import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { PackagePlus } from "lucide-react";
import { useWorkspace } from "../lib/context";
import { command } from "../lib/api";
import { Modal, field } from "./ui";
export function ReceiveStockDialog({ onClose }: { onClose: () => void }) {
  const { data, run, busy } = useWorkspace();
  return (
    <Modal title="Receive stock" onClose={() => onClose()}>
      <div className="notice">
        <PackagePlus size={20} />
        Every received unit gets a permanent identifier. Existing labels and
        histories stay intact. Stock received in store is automatically sorted
        by product ID; full destinations and other holds remain in review.
      </div>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const done = await run(
            () =>
              command("receive", {
                productId: field(f, "productId"),
                quantity: Number(f.get("quantity")),
                status: field(f, "initialStatus"),
              }),
            "Stock received. Check Automatic sorting for routes and holds.",
          );
          if (done) onClose();
        }}
      >
        <label>
          Product
          <NativeSelect name="productId">
            {data.master.products.map((p) => (
              <NativeSelectOption key={p.id} value={p.id}>
                {p.name} · {p.id}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <label>
          Initial lifecycle
          <NativeSelect name="initialStatus">
            <NativeSelectOption>Received in Store</NativeSelectOption>
            <NativeSelectOption>Offered</NativeSelectOption>
            <NativeSelectOption>In-Transit</NativeSelectOption>
          </NativeSelect>
        </label>
        <label>
          Quantity
          <Input
            type="number"
            name="quantity"
            min={1}
            max={100}
            defaultValue={1}
            required
          />
        </label>
        <Button type="submit" className="primary" disabled={busy}>
          Receive units
        </Button>
      </form>
    </Modal>
  );
}
