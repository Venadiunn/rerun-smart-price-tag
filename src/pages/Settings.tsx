import { AppearanceMenu } from "../components/AppearanceMenu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useState } from "react";

import { useWorkspace } from "../lib/context";
import { supabase } from "../lib/supabase";
import { command } from "../lib/api";
import { PageTitle, Status, Modal, field } from "../components/ui";
import type { Profile } from "../lib/types";
export function Settings() {
  const { data, run, busy } = useWorkspace(),
    [create, setCreate] = useState(false),
    [activation, setActivation] = useState(""),
    [employee, setEmployee] = useState<Profile | null>(null);
  async function invite(body: Record<string, unknown>) {
    const { data: result, error } = await supabase.functions.invoke("staff", {
      body,
    });
    if (error)
      throw new Error((await error.context?.json?.())?.error ?? error.message);
    if (result.error) throw new Error(result.error);
    setActivation(
      `${location.origin}/activate?token_hash=${encodeURIComponent(result.tokenHash)}`,
    );
  }
  return (
    <>
      <PageTitle
        eyebrow="WORKSPACE & ACCESS"
        title="Settings"
        description="Manage your account, appearance, and employee access."
      />
      <div className="settings-grid">
        <Card className="panel gap-0 py-0 ring-0">
          <div className="section-heading">
            <h2>Your account</h2>
          </div>
          <div className="account-card">
            <Avatar className="avatar">
              <AvatarFallback>
                {data.profile.email.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <strong>{data.profile.email}</strong>
            <Status value={data.profile.role} />
          </div>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              await run(async () => {
                if (f.get("password") !== f.get("confirm"))
                  throw new Error("Passwords do not match.");
                const { error } = await supabase.auth.updateUser({
                  password: field(f, "password"),
                });
                if (error) throw error;
              }, "Password changed.");
            }}
          >
            <h3>Change your password</h3>
            <label>
              New password
              <Input
                type="password"
                name="password"
                minLength={12}
                autoComplete="new-password"
                required
              />
            </label>
            <label>
              Confirm password
              <Input
                type="password"
                name="confirm"
                minLength={12}
                autoComplete="new-password"
                required
              />
            </label>
            <Button type="submit" className="secondary" disabled={busy}>
              Update password
            </Button>
          </form>
        </Card>
        <Card className="panel gap-0 py-0 ring-0">
          <div className="section-heading">
            <h2>Workspace details</h2>
          </div>
          <div className="appearance-setting">
            <div>
              <strong>Appearance</strong>
              <p>Choose light, dark, or your device setting.</p>
            </div>
            <AppearanceMenu />
          </div>
          <dl className="workspace-facts">
            <div>
              <dt>Store</dt>
              <dd>ReRun demonstration store</dd>
            </div>
            <div>
              <dt>Currency</dt>
              <dd>USD · prices stored in cents</dd>
            </div>
            <div>
              <dt>Display time zone</dt>
              <dd>America/Chicago</dd>
            </div>
            <div>
              <dt>Master</dt>
              <dd>
                Versioned Excel workbook · revision {data.revision.revision}
              </dd>
            </div>
            <div>
              <dt>Physical tag connection</dt>
              <dd>Simulator</dd>
            </div>
            <div>
              <dt>Data provenance</dt>
              <dd>
                {data.master.products.length.toLocaleString()} fictional
                products with demonstration stock and unit histories.
              </dd>
            </div>
          </dl>
          <p className="hint">
            Inventory writes require a connection. Retry after an error; the
            workspace never reports an unconfirmed write as successful.
          </p>
        </Card>
      </div>
      {data.profile.role === "administrator" && (
        <Card className="panel gap-0 py-0 ring-0">
          <div className="section-heading">
            <div>
              <span className="eyebrow">ADMINISTRATOR CONTROLS</span>
              <h2>Employees</h2>
            </div>
            <Button
              type="button"
              className="primary"
              onClick={() => setCreate(true)}
            >
              Add employee
            </Button>
          </div>
          <div className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.profiles.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      {p.email}
                      {p.id === data.profile.id && <small>Your account</small>}
                    </TableCell>
                    <TableCell>{p.role}</TableCell>
                    <TableCell>
                      <Status value={p.active ? "Active" : "Disabled"} />
                    </TableCell>
                    <TableCell>
                      <div className="actions">
                        <Button
                          type="button"
                          className="secondary small"
                          disabled={busy || !p.active}
                          onClick={() =>
                            run(
                              () =>
                                invite({
                                  action: "activation",
                                  userId: p.id,
                                  email: p.email,
                                  role: p.role,
                                }),
                              "Private activation link generated.",
                            )
                          }
                        >
                          Activation / recovery
                        </Button>
                        <Button
                          type="button"
                          className="text-button"
                          disabled={p.id === data.profile.id}
                          onClick={() => setEmployee(p)}
                        >
                          Edit access
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="hint">
            Administrators manage access. Managers manage master data and price
            approvals. Associates perform daily inventory, scanning, and tag
            workflows.
          </p>
        </Card>
      )}
      {create && (
        <Modal title="Add employee" onClose={() => setCreate(false)}>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                await run(async () => {
                  await invite({
                    action: "create",
                    email: field(f, "email"),
                    role: field(f, "role"),
                  });
                  return true;
                }, "Employee created. Share their private activation link.")
              )
                setCreate(false);
            }}
          >
            <label>
              Email
              <Input name="email" type="email" required autoComplete="off" />
            </label>
            <label>
              Role
              <NativeSelect name="role">
                <NativeSelectOption>associate</NativeSelectOption>
                <NativeSelectOption>manager</NativeSelectOption>
                <NativeSelectOption>administrator</NativeSelectOption>
              </NativeSelect>
            </label>
            <p className="hint">
              ReRun generates a private activation link. No email is sent
              automatically.
            </p>
            <Button type="submit" className="primary" disabled={busy}>
              Create employee
            </Button>
          </form>
        </Modal>
      )}
      {employee && (
        <Modal title="Edit employee access" onClose={() => setEmployee(null)}>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                await run(
                  () =>
                    command("staff_update", {
                      id: employee.id,
                      role: field(f, "role"),
                      active: f.get("active") === "on",
                    }),
                  "Access updated.",
                )
              )
                setEmployee(null);
            }}
          >
            <strong>{employee.email}</strong>
            <label>
              Role
              <NativeSelect name="role" defaultValue={employee.role}>
                <NativeSelectOption>associate</NativeSelectOption>
                <NativeSelectOption>manager</NativeSelectOption>
                <NativeSelectOption>administrator</NativeSelectOption>
              </NativeSelect>
            </label>
            <label className="checkbox-label">
              <Checkbox
                name="active"
                aria-label="Active staff access"
                defaultChecked={employee.active}
              />
              Active staff access
            </label>
            <Button type="submit" className="primary" disabled={busy}>
              Save access
            </Button>
          </form>
        </Modal>
      )}
      {activation && (
        <Modal
          title="Private account activation"
          onClose={() => setActivation("")}
        >
          <p>
            This link allows the employee to set their own password. Share it
            privately with the intended employee. It expires according to the
            Auth link lifetime and can be used once.
          </p>
          <Textarea
            readOnly
            aria-label="Private activation link"
            value={activation}
            rows={4}
          />
          <Button
            type="button"
            className="primary"
            onClick={() =>
              run(
                () => navigator.clipboard.writeText(activation),
                "Activation link copied.",
              )
            }
          >
            Copy private link
          </Button>
        </Modal>
      )}
    </>
  );
}
