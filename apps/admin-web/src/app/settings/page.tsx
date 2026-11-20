"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { vstudioApi } from "@vstudio/api-client";
import { Button, Input, SelectControl } from "sanui";
import { AppShell } from "../../components/app-shell";
import {
  useAppearance,
  type ThemeFamily,
  type ThemeMode,
} from "../../components/appearance-provider";

const schema = z.object({
  name: z.string().trim().min(2, "Enter your organization name."),
  slug: z
    .string()
    .trim()
    .min(2, "Enter a workspace slug.")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers, and hyphens.",
    ),
});

type Values = z.infer<typeof schema>;
const invitationSchema = z.object({
  email: z.string().trim().email("Enter a valid work email."),
  role: z.string().trim().min(1, "Choose a workspace role."),
});
type InvitationValues = z.infer<typeof invitationSchema>;
type SettingsTab = "organization" | "members" | "public" | "api" | "appearance";

const themeModes: { value: ThemeMode; label: string; description: string }[] = [
  {
    value: "system",
    label: "System default",
    description: "Follow your device appearance setting.",
  },
  {
    value: "light",
    label: "Light",
    description: "Use the light SanUI palette.",
  },
  {
    value: "dark",
    label: "Dark",
    description: "Use a dark canvas and accessible light text.",
  },
];

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<SettingsTab>("organization");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const { mode, family, setMode, setFamily } = useAppearance();
  const membersQuery = useQuery({
    queryKey: ["organization-members"],
    queryFn: () => vstudioApi.organizationMembers(),
    enabled: tab === "members",
    retry: false,
  });
  const accountQuery = useQuery({ queryKey: ["me"], queryFn: () => vstudioApi.me(), retry: false });
  const currentUserId = accountQuery.data?.user.id ?? "";
  const currentRole = accountQuery.data?.role ?? "";
  const canViewSettings = accountQuery.data?.permissions.includes("VIEW_SETTINGS") ?? false;
  const canManageUsers = accountQuery.data?.permissions.includes("MANAGE_USERS") ?? false;
  const canEditOrganization = accountQuery.data?.permissions.includes("EDIT_ORGANIZATION_SETTINGS") ?? false;
  const canEditProjects = accountQuery.data?.permissions.includes("EDIT_PROJECT") ?? false;
  const canManageApiKeys = accountQuery.data?.permissions.includes("MANAGE_API_KEYS") ?? false;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", slug: "" },
  });
  const inviteForm = useForm<InvitationValues>({
    resolver: zodResolver(invitationSchema),
    defaultValues: { email: "", role: "VIEWER" },
  });
  const inviteMutation = useMutation({
    mutationFn: (values: InvitationValues) => vstudioApi.inviteOrganizationMember(values),
    onSuccess: async response => {
      setInviteUrl(response.invitation.inviteUrl);
      setInviteMessage("Invitation created. Copy the link and share it with your teammate.");
      inviteForm.reset({ email: "", role: "VIEWER" });
      await queryClient.invalidateQueries({ queryKey: ["organization-members"] });
    },
    onError: error => setInviteMessage(error instanceof Error ? error.message : "The invitation could not be created."),
  });
  const memberMutation = useMutation({
    mutationFn: ({ memberId, input }: { memberId: string; input: { role?: string; active?: boolean } }) => vstudioApi.updateOrganizationMember(memberId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organization-members"] }),
  });
  const revokeMutation = useMutation({
    mutationFn: (invitationId: string) => vstudioApi.revokeOrganizationInvitation(invitationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organization-members"] }),
  });

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "members") {
      setTab("members");
    }
  }, []);

  useEffect(() => {
    if (accountQuery.data) {
      form.reset({ name: accountQuery.data.organization.name, slug: accountQuery.data.organization.slug });
      setLoading(false);
    } else if (accountQuery.error) {
      setStatus(accountQuery.error instanceof Error ? accountQuery.error.message : "Unable to load organization settings.");
      setLoading(false);
    }
  }, [accountQuery.data, accountQuery.error, form]);

  useEffect(() => {
    if (!accountQuery.data) return;
    if (tab === "members" && !canManageUsers) setTab("organization");
    if (tab === "public" && !canEditProjects) setTab("organization");
    if (tab === "api" && !canManageApiKeys) setTab("organization");
    if (!canViewSettings && canManageUsers) setTab("members");
    else if (!canViewSettings && canManageApiKeys) setTab("api");
  }, [tab, canManageUsers, canEditProjects, canManageApiKeys, canViewSettings, accountQuery.data]);

  async function submit(values: Values) {
    setStatus("");
    try {
      if (!canEditOrganization) return;
      await vstudioApi.updateOrganization({
        name: values.name,
        slug: values.slug,
      });
      setStatus("Organization settings saved.");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "The organization settings could not be saved.",
      );
    }
  }

  const tabs: [SettingsTab, string][] = [
    ...(canViewSettings ? [["organization", "Organization"] as [SettingsTab, string]] : []),
    ...(canManageUsers ? [["members", "Members & roles"] as [SettingsTab, string]] : []),
    ...(canViewSettings && canEditProjects ? [["public", "Public maps"] as [SettingsTab, string]] : []),
    ...(canViewSettings && canManageApiKeys ? [["api", "API keys"] as [SettingsTab, string]] : []),
    ...(canViewSettings ? [["appearance", "Appearance"] as [SettingsTab, string]] : []),
  ];

  return (
    <AppShell>
      <div className="settings-page">
        <div className="page-title-row">
          <div>
            <p className="page-eyebrow">Workspace</p>
            <h1 className="page-title">Settings</h1>
            <p className="page-subtitle">
              Manage organization details, access, appearance, and public map
              defaults.
            </p>
          </div>
        </div>
        <section className="surface-card settings-card">
          <nav className="settings-tabs" aria-label="Settings sections">
            {tabs.map(([id, label]) => (
              <button
                type="button"
                key={id}
                aria-current={tab === id ? "page" : undefined}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="settings-content">
            {tab === "organization" && (
              <>
                <h2>Organization profile</h2>
                <p>These details identify your VStudio workspace.</p>
                <form
                  onSubmit={form.handleSubmit(submit)}
                  className="settings-form"
                >
                  <div className="form-grid">
                    <div className="form-field">
                      <label htmlFor="org-name">Organization name</label>
                      <Input
                        id="org-name"
                        disabled={loading || !canEditOrganization}
                        {...form.register("name")}
                      />
                    </div>
                    <div className="form-field">
                      <label htmlFor="org-slug">Workspace slug</label>
                      <Input
                        id="org-slug"
                        disabled={loading || !canEditOrganization}
                        {...form.register("slug")}
                      />
                    </div>
                  </div>
                  {form.formState.errors.name && (
                    <small className="form-error">
                      {form.formState.errors.name.message}
                    </small>
                  )}
                  {form.formState.errors.slug && (
                    <small className="form-error">
                      {form.formState.errors.slug.message}
                    </small>
                  )}
                  {status && (
                    <p className="form-status" role="status">
                      {status}
                    </p>
                  )}
                  {canEditOrganization ? (
                    <div className="form-actions">
                      <Button type="submit" disabled={loading || form.formState.isSubmitting}>
                        {form.formState.isSubmitting ? "Saving…" : "Save changes"}
                      </Button>
                    </div>
                  ) : (
                    <p className="field-hint">You can view workspace details, but your role cannot edit them.</p>
                  )}
                </form>
              </>
            )}
            {tab === "members" && (
              <section className="members-settings" aria-labelledby="members-title">
                <div className="members-heading">
                  <div>
                    <h2 id="members-title">Members &amp; roles</h2>
                    <p>Grant the minimum access each teammate needs.</p>
                  </div>
                  <Button onClick={() => { setInviteOpen(true); setInviteUrl(""); setInviteMessage(""); }} disabled={!membersQuery.data}>
                    ＋ Invite a teammate
                  </Button>
                </div>

                {membersQuery.isPending && <p className="activity-state" role="status">Loading workspace members…</p>}
                {membersQuery.error && <p className="form-error" role="alert">{membersQuery.error instanceof Error ? membersQuery.error.message : "Workspace members could not be loaded."}</p>}

                {!!membersQuery.data?.members.length && (
                  <div className="members-list" aria-label="Workspace members">
                    {membersQuery.data.members.map(member => {
                      const protectedMember = member.role === "OWNER";
                      const canEdit = !protectedMember && (currentRole === "OWNER" || !member.roleIsPrivileged);
                      const roleOptions = membersQuery.data?.roleOptions.filter(option => option.assignable || option.id === member.role) ?? [];
                      return (
                        <div className={`member-row${member.active ? "" : " member-row--inactive"}`} key={member.id}>
                          <span className="user-avatar" aria-hidden="true">{member.name.split(/\s+/).map(part => part[0]).slice(0, 2).join("").toUpperCase()}</span>
                          <span className="member-identity">
                            <strong>{member.name}{member.userId === currentUserId ? <small className="member-you">You</small> : null}</strong>
                            <small>{member.email}{member.active ? "" : " · Inactive"}</small>
                          </span>
                          <label className="sr-only" htmlFor={`role-${member.id}`}>Role for {member.name}</label>
                          <SelectControl
                            id={`role-${member.id}`}
                            className="member-role-select"
                            value={member.role}
                            disabled={!canEdit || memberMutation.isPending}
                            onChange={event => memberMutation.mutate({ memberId: member.id, input: { role: event.target.value } })}
                          >
                            {member.role === "OWNER" && <option value="OWNER">Owner</option>}
                            {roleOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                          </SelectControl>
                          {!protectedMember && member.userId !== currentUserId && canEdit && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={memberMutation.isPending}
                              onClick={() => memberMutation.mutate({ memberId: member.id, input: { active: !member.active } })}
                            >
                              {member.active ? "Deactivate" : "Reactivate"}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {membersQuery.data && membersQuery.data.members.length === 0 && <p className="activity-state">No workspace members were found.</p>}
                {memberMutation.error && <p className="form-error" role="alert">{memberMutation.error instanceof Error ? memberMutation.error.message : "The member could not be updated."}</p>}

                {!!membersQuery.data?.invitations.length && (
                  <div className="pending-invitations">
                    <h3>Pending invitations</h3>
                    {membersQuery.data.invitations.map(invitation => (
                      <div className="pending-invitation-row" key={invitation.id}>
                        <span><strong>{invitation.email}</strong><small>{invitation.roleLabel} · Expires {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(invitation.expiresAt))}</small></span>
                        <Button variant="ghost" size="sm" disabled={revokeMutation.isPending} onClick={() => revokeMutation.mutate(invitation.id)}>Revoke</Button>
                      </div>
                    ))}
                    {revokeMutation.error && <p className="form-error" role="alert">{revokeMutation.error instanceof Error ? revokeMutation.error.message : "The invitation could not be revoked."}</p>}
                  </div>
                )}
              </section>
            )}
            {tab === "public" && (
              <>
                <h2>Public map defaults</h2>
                <p>Choose which property details are visible to customers.</p>
                <div className="setting-options">
                  <label className="setting-check">
                    <Input type="checkbox" defaultChecked />{" "}
                    <span>Display prices on public maps</span>
                  </label>
                  <label className="setting-check">
                    <Input type="checkbox" defaultChecked />{" "}
                    <span>Display area measurements</span>
                  </label>
                  <label className="setting-check">
                    <Input type="checkbox" /> <span>Display sold units</span>
                  </label>
                </div>
                <div className="form-actions">
                  <Button>Save public defaults</Button>
                </div>
              </>
            )}
            {tab === "api" && (
              <>
                <h2>API access</h2>
                <p>
                  Use versioned REST endpoints for integrations and automation.
                </p>
                <code className="api-base">https://api.example.com/api/v1</code>
                <Button
                  variant="secondary"
                  onClick={() =>
                    window.alert(
                      "Create an API key after the workspace key-management flow is configured.",
                    )
                  }
                >
                  ＋ Create API key
                </Button>
              </>
            )}
            {tab === "appearance" && (
              <>
                <h2>Appearance</h2>
                <p>
                  Choose how VStudio looks on this browser. Your preference is
                  saved automatically.
                </p>
                <div className="appearance-settings">
                  <div className="appearance-fields">
                    <div className="form-field">
                      <label htmlFor="theme-mode">Theme</label>
                      <SelectControl
                        id="theme-mode"
                        className="appearance-select sanui-select"
                        value={mode}
                        onChange={(event) =>
                          setMode(event.target.value as ThemeMode)
                        }
                      >
                        {themeModes.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </SelectControl>
                      <small>
                        {
                          themeModes.find((option) => option.value === mode)
                            ?.description
                        }
                      </small>
                    </div>
                    <div className="form-field">
                      <label htmlFor="theme-family">SanUI color family</label>
                      <SelectControl
                        id="theme-family"
                        className="appearance-select sanui-select"
                        value={family}
                        onChange={(event) =>
                          setFamily(event.target.value as ThemeFamily)
                        }
                      >
                        <option value="green">Green · SanUI</option>
                        <option value="blue">Blue · SanUI</option>
                      </SelectControl>
                      <small>
                        Applies the selected SanUI brand palette across every screen, while keeping your light, dark, or system appearance.
                      </small>
                    </div>
                  </div>
                  <div
                    className="appearance-preview"
                    aria-label={`${family} color family with ${mode} appearance preview`}
                  >
                    <div className="appearance-preview__heading">
                      <span>Live preview</span>
                      <span className="appearance-preview__badge">
                        {`${family} family · ${themeModes.find((option) => option.value === mode)?.label}`}
                      </span>
                    </div>
                    <div className="appearance-preview__sample">
                      <div
                        className="appearance-preview__swatches"
                        aria-hidden="true"
                      >
                        <span className="appearance-preview__swatch appearance-preview__swatch--primary" />
                        <span className="appearance-preview__swatch appearance-preview__swatch--surface" />
                        <span className="appearance-preview__swatch appearance-preview__swatch--canvas" />
                      </div>
                      <div className="appearance-preview__copy">
                        <strong>SanUI color tokens</strong>
                        <small>Shared palette across VStudio screens</small>
                      </div>
                      <span className="appearance-preview__action">
                        Primary action
                      </span>
                    </div>
                    <p className="appearance-preview__note">
                      System default follows your operating system. Light and
                      dark modes keep status colors consistent.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
        <div className="settings-footnote">
          Your organization’s data is isolated from other VStudio workspaces by
          backend tenant policies.
        </div>
        {inviteOpen && (
          <div className="invite-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setInviteOpen(false); }}>
            <section className="invite-dialog" role="dialog" aria-modal="true" aria-labelledby="invite-title">
              <header className="invite-dialog__header">
                <div><p className="page-eyebrow">Workspace access</p><h2 id="invite-title">Invite a teammate</h2></div>
                <button type="button" className="invite-dialog__close" aria-label="Close invitation dialog" onClick={() => setInviteOpen(false)}>×</button>
              </header>
              {inviteUrl ? (
                <div className="invite-success">
                  <p role="status">{inviteMessage}</p>
                  <label htmlFor="invite-url">Invitation link</label>
                  <div className="invite-link-row">
                    <Input id="invite-url" readOnly value={inviteUrl} onFocus={event => event.currentTarget.select()} />
                    <Button type="button" onClick={() => void navigator.clipboard.writeText(inviteUrl).then(() => setInviteMessage("Invitation link copied. Share it with your teammate."), () => setInviteMessage("Copy the selected link using your browser’s copy command."))}>Copy link</Button>
                  </div>
                  <small>Email delivery isn’t configured, so share this link directly. It expires in seven days.</small>
                </div>
              ) : (
                <form className="invite-form" onSubmit={inviteForm.handleSubmit(values => { setInviteMessage(""); inviteMutation.mutate(values); })}>
                  <p>Choose a role with only the access this teammate needs.</p>
                  <div className="form-field">
                    <label htmlFor="invite-email">Work email</label>
                    <Input id="invite-email" type="email" autoComplete="email" placeholder="teammate@company.com" {...inviteForm.register("email")} />
                    {inviteForm.formState.errors.email && <small className="form-error">{inviteForm.formState.errors.email.message}</small>}
                  </div>
                  <div className="form-field">
                    <label htmlFor="invite-role">Workspace role</label>
                    <SelectControl id="invite-role" className="appearance-select" {...inviteForm.register("role")}>
                      {membersQuery.data?.roleOptions.filter(option => option.assignable).map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </SelectControl>
                  </div>
                  {inviteMessage && <p className="form-error" role="alert">{inviteMessage}</p>}
                  <footer className="invite-dialog__actions">
                    <Button type="button" variant="secondary" onClick={() => setInviteOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={inviteMutation.isPending}>{inviteMutation.isPending ? "Creating invite…" : "Create invitation"}</Button>
                  </footer>
                </form>
              )}
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}
