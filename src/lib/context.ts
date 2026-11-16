import { createContext, useContext } from "react";
import type { Snapshot } from "./types";
export interface Workspace {
  data: Snapshot;
  busy: boolean;
  run: <T>(work: () => Promise<T>, success?: string) => Promise<T | undefined>;
  refresh: () => Promise<void>;
  openProduct: (id: string, unitId?: string) => void;
}
export const WorkspaceContext = createContext<Workspace | null>(null);
export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("Workspace missing");
  return context;
}
export const isManager = (role: string) =>
  role === "manager" || role === "administrator";
