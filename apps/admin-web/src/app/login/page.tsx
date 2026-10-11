"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { vstudioApi } from "@vstudio/api-client";
import { Button } from "sanui";
import { useState } from "react";

const schema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});
type Values = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });
  async function submit(values: Values) {
    setServerError("");
    try {
      await vstudioApi.login(values);
      router.replace("/");
    } catch (error) {
      setServerError(
        error instanceof Error ? error.message : "Sign in failed.",
      );
    }
  }
  return (
    <main className="auth-page">
      <Link href="/" className="vstudio-brand auth-brand">
        <span className="vstudio-logo">V</span> VStudio
      </Link>
      <section className="auth-card">
        <p className="page-eyebrow">Welcome back</p>
        <h1>Sign in to your workspace</h1>
        <p className="auth-description">
          Manage your projects and property inventory.
        </p>
        <form className="auth-form" onSubmit={form.handleSubmit(submit)}>
          <div className="form-field">
            <label htmlFor="email">Work email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              {...form.register("email")}
            />
            {form.formState.errors.email && (
              <small className="form-error">
                {form.formState.errors.email.message}
              </small>
            )}
          </div>
          <div className="form-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              {...form.register("password")}
            />
            {form.formState.errors.password && (
              <small className="form-error">
                {form.formState.errors.password.message}
              </small>
            )}
          </div>
          {serverError && (
            <p className="form-error" role="alert">
              {serverError}
            </p>
          )}
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="auth-switch">
          New to VStudio? <Link href="/register">Create an account</Link>
        </p>
        <p className="auth-local-note">
          For local development, create an organization using the registration
          form or run the database seed.
        </p>
      </section>
    </main>
  );
}
