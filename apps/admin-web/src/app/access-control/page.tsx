"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { vstudioApi } from "@vstudio/api-client";
import { Badge, Button } from "sanui";
import { AppShell } from "../../components/app-shell";

export default function AccessControlPage() {
  const queryClient = useQueryClient();
  const [selectedRole, setSelectedRole] = useState("OWNER");
  const [draft, setDraft] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [newRoleOpen, setNewRoleOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");
  const rolesQuery = useQuery({
    queryKey: ["organization-role-permissions"],
    queryFn: () => vstudioApi.organizationRolePermissions(),
    retry: false,
  });
  const accountQuery = useQuery({ queryKey: ["me"], queryFn: () => vstudioApi.me(), retry: false });
  const membersQuery = useQuery({
    queryKey: ["organization-members"],
    queryFn: () => vstudioApi.organizationMembers(),
    retry: false,
  });
  const role = rolesQuery.data?.roles.find(item => item.id === selectedRole);
  const dirty = useMemo(() => {
    if (!role) return false;
    const current = new Set(role.permissions);
    const next = new Set(draft);
    return current.size !== next.size || [...current].some(permission => !next.has(permission));
  }, [draft, role]);
  const updateMutation = useMutation({
    mutationFn: () => vstudioApi.updateRolePermissions(selectedRole, draft),
    onSuccess: async () => {
      setNotice(`${role?.label ?? selectedRole} permissions saved.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["organization-role-permissions"] }),
        queryClient.invalidateQueries({ queryKey: ["me"] }),
      ]);
    },
    onError: error => setNotice(error instanceof Error ? error.message : "Permissions could not be saved."),
  });
  const createRoleMutation = useMutation({
    mutationFn: () => vstudioApi.createOrganizationRole({ name: newRoleName, description: newRoleDescription }),
    onSuccess: async response => {
      setSelectedRole(response.role.id);
      setDraft([]);
      setNotice(`${response.role.label} created. Configure its permissions and save when ready.`);
      setNewRoleName("");
      setNewRoleDescription("");
      setNewRoleOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["organization-role-permissions"] });
      await queryClient.invalidateQueries({ queryKey: ["organization-members"] });
    },
    onError: error => setNotice(error instanceof Error ? error.message : "The role could not be created."),
  });

  useEffect(() => {
    const selected = rolesQuery.data?.roles.find(item => item.id === selectedRole);
    if (selected) setDraft(selected.permissions);
  }, [selectedRole, rolesQuery.dataUpdatedAt]);

  function togglePermission(permission: string, checked: boolean) {
    setDraft(current => checked
      ? current.includes(permission) ? current : [...current, permission]
      : current.filter(item => item !== permission));
    setNotice("");
  }

  const canManage = accountQuery.data?.role === "OWNER";
  const enabledCount = role ? draft.length : 0;

  return (
    <AppShell>
      <div className="access-control-page">
        <div className="page-title-row">
          <div>
            <p className="page-eyebrow">Workspace administration</p>
            <h1 className="page-title">Access control</h1>
            <p className="page-subtitle">Manage built-in roles or create custom roles with only the access each teammate needs.</p>
          </div>
          <div className="access-title-actions">
            {role && <Badge tone={role.id === "OWNER" ? "neutral" : role.editable ? "success" : "neutral"}>{role.id === "OWNER" ? "Always full access" : role.editable ? "Editable by owner" : "Read only"}</Badge>}
            {canManage && <Button type="button" onClick={() => { setNewRoleOpen(true); setNotice(""); }}>＋ New role</Button>}
          </div>
        </div>

        <div className="access-summary-grid" aria-label="Access control summary">
          <article className="access-summary-card"><span>Roles</span><strong>{rolesQuery.data?.roles.length ?? "—"}</strong><small>Built-in and custom roles</small></article>
          <article className="access-summary-card"><span>Permission groups</span><strong>{rolesQuery.data?.permissionGroups.length ?? "—"}</strong><small>Grouped by app area</small></article>
          <article className="access-summary-card"><span>Your role</span><strong>{accountQuery.data?.roleLabel ?? accountQuery.data?.role ?? "—"}</strong><small>Changes apply by your workspace role</small></article>
        </div>

        {rolesQuery.isPending && <section className="access-state" role="status">Loading roles and permissions…</section>}
        {rolesQuery.error && <section className="access-state access-state--error" role="alert">{rolesQuery.error instanceof Error ? rolesQuery.error.message : "Role permissions could not be loaded."}</section>}

        <div className="access-control-grid">
          {rolesQuery.data && (
            <section className="access-workspace">
              <aside className="access-role-list" aria-label="Select a role">
                <div className="access-role-list__header"><span>Roles</span><small>{rolesQuery.data.roles.length} roles</small></div>
                {rolesQuery.data.roles.map(item => (
                  <button type="button" key={item.id} className={item.id === selectedRole ? "is-selected" : ""} onClick={() => { setSelectedRole(item.id); setNotice(""); }}>
                    <span className="access-role-symbol" aria-hidden="true">{item.label.slice(0, 1)}</span>
                    <span><strong>{item.label}</strong><small>{item.builtIn ? "Built-in" : "Custom role"} · {item.permissions.length} permissions</small></span>
                    <span className="access-role-arrow" aria-hidden="true">›</span>
                  </button>
                ))}
              </aside>

              <div className="access-permission-panel">
                {role && (
                  <>
                    <header className="access-permission-header">
                      <div><p className="page-eyebrow">Role permissions</p><h2>{role.label}</h2><p>{role.description}</p></div>
                      <div className="access-count"><strong>{enabledCount}</strong><span>of {rolesQuery.data.permissionGroups.reduce((total, group) => total + group.permissions.length, 0)} allowed</span></div>
                    </header>

                    {role.id === "OWNER" && <div className="access-owner-note" role="note">The Owner role always has full workspace access and cannot be restricted.</div>}
                    {role.id !== "OWNER" && !canManage && <div className="access-owner-note" role="note">Only the workspace owner can change role permissions. Administrators can review this matrix.</div>}
                    {!role.builtIn && <div className="access-owner-note" role="note">Custom roles start with no permissions. Select the access this role should receive, then save.</div>}

                    <div className="permission-groups">
                      {rolesQuery.data.permissionGroups.map(group => (
                        <section className="permission-group" key={group.id}>
                          <header><div><h3>{group.label}</h3><p>{group.description}</p></div><span>{group.permissions.filter(permission => draft.includes(permission.id)).length}/{group.permissions.length}</span></header>
                          <div className="permission-group__rows">
                            {group.permissions.map(permission => {
                              const checked = draft.includes(permission.id);
                              return (
                                <label className={`permission-row${checked ? " is-granted" : ""}`} key={permission.id}>
                                  <input type="checkbox" checked={checked} disabled={!role.editable || !canManage || updateMutation.isPending} onChange={event => togglePermission(permission.id, event.target.checked)} />
                                  <span className="permission-row__copy"><strong>{permission.label}</strong><small>{permission.description}</small></span>
                                  <span className="permission-row__state">{checked ? "Allowed" : "No access"}</span>
                                </label>
                              );
                            })}
                          </div>
                        </section>
                      ))}
                    </div>

                    <footer className="access-actions">
                      <p className={updateMutation.error ? "form-error" : "form-status"} role="status">{notice || (dirty ? "You have unsaved permission changes." : "Permissions are up to date.")}</p>
                      <div>
                        {role.editable && canManage && <Button variant="secondary" type="button" disabled={updateMutation.isPending || !dirty} onClick={() => setDraft(role.defaults)}>Reset defaults</Button>}
                        {role.editable && canManage && <Button type="button" disabled={updateMutation.isPending || !dirty} onClick={() => updateMutation.mutate()}>{updateMutation.isPending ? "Saving…" : "Save permissions"}</Button>}
                      </div>
                    </footer>
                  </>
                )}
              </div>
            </section>
          )}

          <section className="surface-card access-members-card" aria-labelledby="access-members-title">
            <header className="surface-header">
              <div>
                <h2 id="access-members-title">Workspace members</h2>
                <p>Each teammate receives access through their assigned role.</p>
              </div>
              <a className="sanui-button sanui-button--secondary sanui-button--md access-manage-members-link" href="/settings?tab=members">
                <span>Manage members</span>
                <span className="access-manage-members-arrow" aria-hidden="true">→</span>
              </a>
            </header>
            {membersQuery.isPending && <p className="access-state" role="status">Loading members…</p>}
            {membersQuery.error && <p className="access-state access-state--error" role="alert">{membersQuery.error instanceof Error ? membersQuery.error.message : "Workspace members could not be loaded."}</p>}
            {membersQuery.data && (
              <>
                <div className="access-member-list">
                  {membersQuery.data.members.map(member => (
                    <article className="access-member-row" key={member.id}>
                      <span className="user-avatar" aria-hidden="true">{member.name.split(/\s+/).map(part => part[0]).slice(0, 2).join("").toUpperCase()}</span>
                      <span className="access-member-identity"><strong>{member.name}</strong><small>{member.email}</small></span>
                      <Badge tone={member.active ? "success" : "neutral"}>{member.active ? "Active" : "Inactive"}</Badge>
                      <span className="access-member-role">{member.roleLabel}</span>
                    </article>
                  ))}
                </div>
                <p className="access-member-footnote">{membersQuery.data.members.length} members · {membersQuery.data.invitations.length} pending invitations</p>
              </>
            )}
          </section>
        </div>

        <p className="access-security-note">Menu visibility is based on these role permissions. The API checks the same permissions on protected actions, so hiding a menu item is not the security boundary.</p>
      </div>
      {newRoleOpen && (
        <div className="invite-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setNewRoleOpen(false); }}>
          <section className="invite-dialog" role="dialog" aria-modal="true" aria-labelledby="new-role-title">
            <header className="invite-dialog__header">
              <div><p className="page-eyebrow">Workspace access</p><h2 id="new-role-title">Create a custom role</h2></div>
              <button type="button" className="invite-dialog__close" aria-label="Close dialog" onClick={() => setNewRoleOpen(false)}>×</button>
            </header>
            <form className="invite-form" onSubmit={event => { event.preventDefault(); createRoleMutation.mutate(); }}>
              <p>Give this role a clear name. You’ll choose its permissions in the role editor next.</p>
              <div className="form-field">
                <label htmlFor="new-role-name">Role name</label>
                <input id="new-role-name" autoFocus required minLength={2} maxLength={80} value={newRoleName} onChange={event => setNewRoleName(event.target.value)} placeholder="e.g. Property Manager" />
              </div>
              <div className="form-field">
                <label htmlFor="new-role-description">Description <span>(optional)</span></label>
                <textarea id="new-role-description" maxLength={240} rows={3} value={newRoleDescription} onChange={event => setNewRoleDescription(event.target.value)} placeholder="Describe what this role is responsible for." />
              </div>
              {createRoleMutation.error && <p className="form-error" role="alert">{createRoleMutation.error instanceof Error ? createRoleMutation.error.message : "The role could not be created."}</p>}
              <footer className="invite-dialog__actions">
                <Button type="button" variant="secondary" onClick={() => setNewRoleOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createRoleMutation.isPending || newRoleName.trim().length < 2}>{createRoleMutation.isPending ? "Creating…" : "Create role"}</Button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </AppShell>
  );
}
