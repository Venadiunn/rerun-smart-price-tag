import { Button } from "@/components/ui/button";
import { WorkspaceShell } from "./components/WorkspaceShell";
import { useEffect, useState, lazy, Suspense } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  Link,
  lazyRouteComponent,
} from "@tanstack/react-router";
import { X, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "./lib/supabase";
import { snapshot, resetWorkspaceCache, SnapshotError } from "./lib/api";
import { WorkspaceContext } from "./lib/context";
import { Auth } from "./components/Auth";
import { Busy } from "./components/ui";
import { Dashboard } from "./pages/Dashboard";
const ProductDrawer = lazy(() =>
  import("./components/ProductDrawer").then((m) => ({
    default: m.ProductDrawer,
  })),
);
const client = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15000, retry: 1, refetchOnWindowFocus: true },
  },
});
const rootRoute = createRootRoute({
  component: WorkspaceShell,
  notFoundComponent: () => (
    <div className="panel empty">
      <h1>Page not found</h1>
      <Button
        variant="outline"
        nativeButton={false}
        role="link"
        render={<Link to="/" />}
      >
        Return to overview
      </Button>
    </div>
  ),
});
const pages = [
  ["/", Dashboard],
  [
    "/inventory",
    lazyRouteComponent(() => import("./pages/Inventory"), "Inventory"),
  ],
  ["/scan", lazyRouteComponent(() => import("./pages/Scan"), "Scan")],
  [
    "/locations",
    lazyRouteComponent(() => import("./pages/Locations"), "Locations"),
  ],
  ["/tags", lazyRouteComponent(() => import("./pages/Tags"), "Tags")],
  ["/pricing", lazyRouteComponent(() => import("./pages/Pricing"), "Pricing")],
  ["/history", lazyRouteComponent(() => import("./pages/History"), "History")],
  [
    "/master",
    lazyRouteComponent(() => import("./pages/MasterData"), "MasterData"),
  ],
  [
    "/settings",
    lazyRouteComponent(() => import("./pages/Settings"), "Settings"),
  ],
] as const;
const routes = pages.map(([path, component]) =>
  createRoute({ getParentRoute: () => rootRoute, path, component }),
);
const router = createRouter({ routeTree: rootRoute.addChildren(routes) });
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
function Runtime() {
  const [session, setSession] = useState<Session | null | undefined>(undefined),
    [pending, setPending] = useState(0),
    [toast, setToast] = useState<{ message: string; error: boolean } | null>(
      null,
    ),
    [selected, setSelected] = useState<{ id: string; unitId?: string } | null>(
      null,
    );
  const queryClient = useQueryClient();
  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data.session);
    });
    let account: string | undefined;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next || (account && account !== next.user.id)) {
        queryClient.clear();
        resetWorkspaceCache();
        setSelected(null);
      }
      account = next?.user.id;
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [queryClient]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  const key = ["workspace", session?.user.id] as const;
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      snapshot(
        session!.user.id,
        signal,
        window.location.pathname === "/" && !queryClient.getQueryData(key)
          ? (overview) => queryClient.setQueryData(key, overview)
          : undefined,
      ),
    enabled: !!session,
    refetchInterval: 20000,
  });
  async function run<T>(
    work: () => Promise<T>,
    success?: string,
  ): Promise<T | undefined> {
    setPending((p) => p + 1);
    try {
      const result = await work();
      await queryClient.invalidateQueries({ queryKey: key, exact: true });
      if (success) setToast({ message: success, error: false });
      return result;
    } catch (error) {
      setToast({
        message: error instanceof Error ? error.message : String(error),
        error: true,
      });
      return undefined;
    } finally {
      setPending((p) => p - 1);
    }
  }
  if (location.pathname === "/activate") return <Auth activation />;
  if (session === undefined) return <Busy />;
  if (!session) return <Auth />;
  if (query.isPending) return <Busy />;
  if (
    !query.data?.revision ||
    (query.error &&
      !(query.error instanceof SnapshotError && query.error.temporary))
  )
    return (
      <div className="access-error">
        <AlertCircle size={35} />
        <h1>Workspace unavailable</h1>
        <p>
          {query.error?.message ?? "The master inventory is being initialized."}
        </p>
        <div className="actions">
          <Button
            type="button"
            className="primary"
            onClick={() => query.refetch()}
          >
            Try again
          </Button>
          <Button
            type="button"
            className="secondary"
            onClick={() => supabase.auth.signOut()}
          >
            Sign out
          </Button>
        </div>
      </div>
    );
  return (
    <WorkspaceContext.Provider
      value={{
        data: query.data,
        busy: pending > 0,
        updatedAt: query.dataUpdatedAt,
        refreshing: query.isFetching,
        refreshFailed: query.isRefetchError,
        run,
        refresh: async () => {
          await query.refetch();
        },
        openProduct: (id, unitId) => setSelected({ id, unitId }),
      }}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <RouterProvider router={router} />
      {selected && query.data.full && (
        <Suspense
          fallback={
            <div className="drawer-loading">
              <Busy label="Opening item…" />
            </div>
          }
        >
          <ProductDrawer
            key={selected.id + selected.unitId}
            productId={selected.id}
            initialUnitId={selected.unitId}
            onClose={() => setSelected(null)}
          />
        </Suspense>
      )}
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
          <span>{toast.message}</span>
          <Button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </Button>
        </div>
      )}
      {pending > 0 && (
        <div className="saving-bar" role="status">
          Saving changes…
        </div>
      )}
    </WorkspaceContext.Provider>
  );
}
export default function WorkspaceApp() {
  return (
    <QueryClientProvider client={client}>
      <Runtime />
    </QueryClientProvider>
  );
}
