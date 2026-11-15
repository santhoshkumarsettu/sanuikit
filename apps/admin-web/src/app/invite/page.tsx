"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { vstudioApi } from "@vstudio/api-client";
import { Button } from "sanui";
import { AuthStory } from "../../components/auth-story";

const schema = z.object({
  name: z.string().trim().min(2, "Enter your name."),
  password: z.string().min(12, "Use a password with at least 12 characters."),
});
type Values = z.infer<typeof schema>;

export default function InvitationPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") ?? "");
  }, []);
  const invitationQuery = useQuery({
    queryKey: ["invitation", token],
    queryFn: () => vstudioApi.invitation(token),
    enabled: Boolean(token),
    retry: false,
  });
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", password: "" },
  });
  const acceptMutation = useMutation({
    mutationFn: (values: Values) => vstudioApi.acceptInvitation(token, values),
    onSuccess: () => router.replace("/"),
  });

  return (
    <main className="auth-page auth-layout invite-page">
      <AuthStory />
      <section className="auth-panel">
        <div className="auth-card">
          <p className="page-eyebrow">Workspace invitation</p>
          {invitationQuery.isPending ? (
            <><h1>Checking your invitation…</h1><p className="auth-description">Please wait while we verify the invitation link.</p></>
          ) : invitationQuery.error || !token ? (
            <><h1>Invitation unavailable</h1><p className="auth-description" role="alert">This invitation link is invalid, has expired, or has already been used. Ask the workspace owner for a new invitation.</p></>
          ) : invitationQuery.data ? (
            <>
              <h1>Join {invitationQuery.data.organizationName}</h1>
              <p className="auth-description">
                You’ve been invited as <strong>{invitationQuery.data.roleLabel}</strong> using <strong>{invitationQuery.data.email}</strong>. Create your account or enter the password for your existing VStudio account.
              </p>
              <form className="auth-form" onSubmit={form.handleSubmit(values => acceptMutation.mutate(values))}>
                <div className="form-field">
                  <label htmlFor="invite-name">Your name</label>
                  <input id="invite-name" autoComplete="name" {...form.register("name")} />
                  {form.formState.errors.name && <small className="form-error">{form.formState.errors.name.message}</small>}
                </div>
                <div className="form-field">
                  <label htmlFor="invite-password">Password</label>
                  <input id="invite-password" type="password" autoComplete="new-password" {...form.register("password")} />
                  <small className="field-hint">Use your existing account password, or create one with at least 12 characters.</small>
                  {form.formState.errors.password && <small className="form-error">{form.formState.errors.password.message}</small>}
                </div>
                {acceptMutation.error && <p className="form-error" role="alert">{acceptMutation.error instanceof Error ? acceptMutation.error.message : "The invitation could not be accepted."}</p>}
                <Button type="submit" disabled={acceptMutation.isPending}>{acceptMutation.isPending ? "Joining workspace…" : "Accept invitation"}</Button>
              </form>
            </>
          ) : null}
          <p className="auth-switch">Invitation links expire after seven days.</p>
        </div>
        <footer className="auth-panel-footer"><span>© 2026 VStudio</span><span>Property, organized.</span></footer>
      </section>
    </main>
  );
}
