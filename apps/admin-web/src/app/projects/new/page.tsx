"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { projectCreateSchema } from "@vstudio/validation";
import { vstudioApi } from "@vstudio/api-client";
import { Button, Input, SelectControl, TextAreaControl } from "sanui";
import { AppShell } from "../../../components/app-shell";
import { ProjectContactFields } from "../../../components/project-contact-fields";

type ProjectValues = z.infer<typeof projectCreateSchema>;
const projectTypes = [
  "PLOT_LAYOUT",
  "APARTMENT",
  "VILLA",
  "COMMERCIAL",
  "OFFICE",
  "PARKING",
  "WAREHOUSE",
  "FLOOR_PLAN",
  "CUSTOM",
] as const;

export default function NewProjectPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [logo, setLogo] = useState<File | null>();
  const form = useForm<ProjectValues>({
    resolver: zodResolver(projectCreateSchema),
    defaultValues: {
      name: "",
      slug: "",
      projectType: "PLOT_LAYOUT",
      description: "",
      location: "",
      contactEmail: "",
      contactPhone: "",
    },
  });
  const createProject = useMutation({
    mutationFn: (values: ProjectValues) => vstudioApi.createProject(values, logo ?? undefined),
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      const returnToStudio =
        new URLSearchParams(window.location.search).get("from") === "studio";
      router.push(
        returnToStudio
          ? `/studio?project=${encodeURIComponent(project.id)}`
          : `/projects/${project.slug}`,
      );
    },
  });
  function updateName(name: string) {
    form.setValue("name", name, { shouldValidate: true });
    form.setValue(
      "slug",
      name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
      { shouldValidate: true },
    );
  }
  return (
    <AppShell>
      <div className="project-create-page">
        <div className="page-title-row">
          <div>
            <p className="page-eyebrow">
              <Link href="/projects">Projects</Link> / Create
            </p>
            <h1 className="page-title">Create a project</h1>
            <p className="page-subtitle">
              Start with the basics. You can add layouts and inventory next.
            </p>
          </div>
        </div>
        <section className="surface-card form-card">
          <form
            className="project-form"
            onSubmit={form.handleSubmit((values) =>
              createProject.mutate(values),
            )}
          >
            <div className="form-field">
              <label htmlFor="project-name">Project name</label>
              <Input
                id="project-name"
                placeholder="e.g. Prestige Estates Projects"
                {...form.register("name", {
                  onChange: (event) => updateName(event.target.value),
                })}
              />
              {form.formState.errors.name && (
                <small className="form-error">
                  {form.formState.errors.name.message}
                </small>
              )}
            </div>
            <div className="form-field">
              <label htmlFor="project-slug">Public URL slug</label>
              <Input
                id="project-slug"
                placeholder="prestige-estates-projects"
                {...form.register("slug")}
              />
              <small className="field-hint">
                Used for public project URLs when you publish this project.
              </small>
              {form.formState.errors.slug && (
                <small className="form-error">
                  {form.formState.errors.slug.message}
                </small>
              )}
            </div>
            <div className="form-field">
              <label htmlFor="project-type">Project type</label>
              <SelectControl id="project-type" {...form.register("projectType")}>
                {projectTypes.map((type) => (
                  <option key={type} value={type}>
                    {type.replaceAll("_", " ")}
                  </option>
                ))}
              </SelectControl>
            </div>
            <div className="form-field">
              <label htmlFor="project-location">Location</label>
              <Input
                id="project-location"
                placeholder="City, state"
                {...form.register("location")}
              />
            </div>
            <div className="form-field project-description-field">
              <label htmlFor="project-description">Description</label>
              <TextAreaControl
                id="project-description"
                placeholder="A short introduction for your team and customers"
                {...form.register("description")}
              />
            </div>
            <ProjectContactFields
              email={form.register("contactEmail")}
              phone={form.register("contactPhone")}
              emailError={form.formState.errors.contactEmail?.message}
              phoneError={form.formState.errors.contactPhone?.message}
              logo={logo}
              onLogoChange={setLogo}
              disabled={createProject.isPending}
            />
            {createProject.error && (
              <p className="form-error project-submit-error" role="alert">
                {createProject.error.message}
              </p>
            )}
            <div className="form-actions">
              <Link
                className="sanui-button sanui-button--secondary sanui-button--md"
                href="/projects"
              >
                Cancel
              </Link>
              <Button type="submit" disabled={createProject.isPending}>
                {createProject.isPending ? "Creating…" : "Create project"}
              </Button>
            </div>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
