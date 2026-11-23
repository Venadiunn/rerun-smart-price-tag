import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./ui/breadcrumb";
import { useState, type CSSProperties } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { SpeedInsights } from "@vercel/speed-insights/react";
import type { BeforeSendMiddleware } from "@vercel/speed-insights";
import {
  LayoutDashboard,
  Boxes,
  ScanLine,
  MapPin,
  Tag,
  BadgeDollarSign,
  History,
  FileSpreadsheet,
  Settings,
  PanelLeft,
  X,
} from "lucide-react";
import { useWorkspace } from "../lib/context";
import { supabase } from "../lib/supabase";
import { Brand } from "./Brand";
import { AppearanceMenu } from "./AppearanceMenu";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import {
  Sidebar,
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "./ui/sidebar";

const navigation = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/scan", label: "Scan & verify", icon: ScanLine },
  { to: "/locations", label: "Store locations", icon: MapPin },
  { to: "/tags", label: "Reusable tags", icon: Tag },
  { to: "/pricing", label: "Pricing", icon: BadgeDollarSign },
  { to: "/history", label: "Activity history", icon: History },
  { to: "/master", label: "Master data", icon: FileSpreadsheet },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

const redactPerformanceUrl: BeforeSendMiddleware = (event) => {
  const url = new URL(event.url, window.location.origin);
  return { ...event, url: url.origin + url.pathname };
};

function WorkspaceFrame() {
  const { data, updatedAt, refreshing, refreshFailed, refresh } =
    useWorkspace();
  const { isMobile, openMobile, setOpenMobile, toggleSidebar, state } =
    useSidebar();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const current = navigation.find((n) => n.to === path);
  const alerts = data.scans.filter(
    (s) => !s.acknowledged_at && s.findings[0] !== "VALID ITEM",
  ).length;
  return (
    <>
      <SpeedInsights route={path} beforeSend={redactPerformanceUrl} />
      <Sidebar collapsible="icon" className="workspace-sidebar">
        <SidebarHeader className="sidebar-brand-row">
          <Brand compact={state === "collapsed" && !isMobile} />
          <span className="workspace-caption group-data-[collapsible=icon]:hidden">
            Store workspace
          </span>
          {isMobile && (
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto"
              aria-label="Close navigation"
              onClick={() => setOpenMobile(false)}
            >
              <X />
            </Button>
          )}
        </SidebarHeader>
        <SidebarContent>
          {[
            { label: "Operations", items: navigation.slice(0, 5) },
            { label: "Management", items: navigation.slice(5) },
          ].map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <nav aria-label={`${group.label} navigation`}>
                <SidebarMenu>
                  {group.items.map((n) => (
                    <SidebarMenuItem key={n.to}>
                      <SidebarMenuButton
                        aria-label={n.label}
                        isActive={path === n.to}
                        tooltip={n.label}
                        className="nav-item"
                        render={
                          <Link
                            to={n.to}
                            activeOptions={{ exact: true }}
                            activeProps={{ "aria-current": "page" }}
                            onClick={() => setOpenMobile(false)}
                          />
                        }
                      >
                        {state === "collapsed" && !isMobile && <n.icon />}
                        <span>{n.label}</span>
                        {n.to === "/scan" && alerts > 0 && (
                          <Badge
                            variant="secondary"
                            className="ml-auto group-data-[collapsible=icon]:hidden"
                            aria-label={`${alerts} open scan alerts`}
                          >
                            {alerts}
                          </Badge>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </nav>
            </SidebarGroup>
          ))}
        </SidebarContent>
        {(state !== "collapsed" || isMobile) && (
          <SidebarFooter className="sidebar-store-info">
            <div className="flex items-center gap-2.5 rounded-lg border border-border p-2.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:p-0">
              <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                <strong className="block truncate text-xs font-medium">
                  Demonstration store
                </strong>
                <span className="text-xs text-muted-foreground">
                  WWT STEM · 2026–27
                </span>
              </div>
            </div>
          </SidebarFooter>
        )}
      </Sidebar>
      <div className="workspace-main min-w-0 flex-1">
        <header className="workspace-topbar">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label={isMobile ? "Toggle navigation" : "Toggle sidebar"}
              aria-expanded={isMobile ? openMobile : state === "expanded"}
              onClick={toggleSidebar}
            >
              <PanelLeft />
            </Button>
            {isMobile && !openMobile && <Brand compact />}
            <Breadcrumb className="min-w-0">
              <BreadcrumbList className="flex-nowrap">
                <BreadcrumbItem className="hidden sm:block">
                  <span>Demo store</span>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden sm:block">
                  /
                </BreadcrumbSeparator>
                <BreadcrumbItem className="min-w-0">
                  <BreadcrumbPage className="truncate">
                    {current?.label ?? "Workspace"}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="connection-status hidden items-center gap-1.5 text-xs text-muted-foreground lg:flex">
              <i className="size-1.5 rounded-full bg-emerald-500" />
              Master v{data.revision.revision}
            </span>
            <AppearanceMenu />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="account-trigger"
                    aria-label="Account menu"
                  />
                }
              >
                <span className="avatar">
                  {data.profile.email.slice(0, 2).toUpperCase()}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="min-w-56 max-w-[calc(100vw-24px)]"
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    <span className="block truncate text-foreground">
                      {data.profile.email}
                    </span>
                    <span className="capitalize">{data.profile.role}</span>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link to="/settings" />}>
                  Account settings
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    void supabase.auth.signOut();
                  }}
                >
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main id="main" className="workspace-content">
          {refreshFailed && (
            <div className="notice warning" role="alert">
              The latest refresh failed. Showing the last successfully loaded
              data. Use Refresh data below to try again.
            </div>
          )}
          <Outlet />
        </main>
        <footer className="workspace-footer">
          <div className="workspace-freshness">
            <span>
              Data refreshed{" "}
              <time dateTime={new Date(updatedAt).toISOString()}>
                {new Intl.DateTimeFormat(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  second: "2-digit",
                  timeZoneName: "short",
                }).format(updatedAt)}
              </time>
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={refreshing}
              onClick={() => void refresh()}
            >
              {refreshing ? "Refreshing…" : "Refresh data"}
            </Button>
          </div>
          <span>Fictional inventory · Display updates are simulated</span>
        </footer>
      </div>
    </>
  );
}

export function WorkspaceShell() {
  const [open, setOpen] = useState(() => {
    try {
      const saved = localStorage.getItem("rerun:sidebar-collapsed");
      return saved === null
        ? matchMedia("(min-width: 1024px)").matches
        : saved !== "true";
    } catch {
      return true;
    }
  });
  return (
    <SidebarProvider
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        try {
          localStorage.setItem("rerun:sidebar-collapsed", String(!value));
        } catch {
          /* Preference remains in memory. */
        }
      }}
      style={
        {
          "--sidebar-width": "240px",
          "--sidebar-width-icon": "64px",
        } as CSSProperties
      }
    >
      <WorkspaceFrame />
    </SidebarProvider>
  );
}
