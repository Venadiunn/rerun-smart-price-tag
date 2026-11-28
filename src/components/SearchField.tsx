import type { ComponentProps } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function SearchField({
  label,
  ...props
}: Omit<ComponentProps<typeof Input>, "aria-label"> & { label: string }) {
  return (
    <div className="search-box">
      <Search aria-hidden="true" />
      <Input {...props} aria-label={label} />
    </div>
  );
}
