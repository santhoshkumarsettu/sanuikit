"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, type ChangeEvent, type ComponentProps } from "react";
import { PROJECT_LOGO_CONTENT_TYPES, PROJECT_LOGO_MAX_BYTES } from "@vstudio/validation";
import { Button, Input } from "sanui";

type Props = {
  email: ComponentProps<typeof Input>;
  phone: ComponentProps<typeof Input>;
  emailError?: string;
  phoneError?: string;
  savedLogoUrl?: string;
  logo?: File | null;
  onLogoChange: (logo?: File | null) => void;
  disabled?: boolean;
};

export function ProjectContactFields({ email, phone, emailError, phoneError, savedLogoUrl, logo, onLogoChange, disabled }: Props) {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string>();
  const [fileError, setFileError] = useState("");

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const logoUrl = logo === null ? undefined : logo ? preview : savedLogoUrl;

  function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    const error = file.size > PROJECT_LOGO_MAX_BYTES
      ? "Choose an image that is 5 MB or smaller."
      : !file.size || (file.type && !PROJECT_LOGO_CONTENT_TYPES.some((type) => type === file.type))
        ? "Choose a PNG, JPEG, or WebP image."
        : "";
    input.setCustomValidity(error);
    setFileError(error);
    if (error) {
      input.value = "";
      return;
    }
    setPreview(URL.createObjectURL(file));
    onLogoChange(file);
  }

  function clearImage() {
    if (fileInput.current) {
      fileInput.current.value = "";
      fileInput.current.setCustomValidity("");
    }
    setFileError("");
    setPreview(undefined);
    onLogoChange(logoUrl && !logo && !fileError ? null : undefined);
  }

  return (
    <fieldset className="project-contact-fields" disabled={disabled}>
      <legend>Sales contact and branding</legend>
      <p className="field-hint">These details appear on the public project page when you publish it.</p>
      <div className="form-field">
        <label htmlFor={`${id}-email`}>Sales email</label>
        <Input
          {...email}
          id={`${id}-email`}
          type="email"
          autoComplete="email"
          maxLength={320}
          placeholder="sales@example.com"
          aria-invalid={Boolean(emailError)}
          aria-describedby={emailError ? `${id}-email-error` : undefined}
        />
        {emailError && <small className="form-error" id={`${id}-email-error`}>{emailError}</small>}
      </div>
      <div className="form-field">
        <label htmlFor={`${id}-phone`}>Sales mobile number</label>
        <Input
          {...phone}
          id={`${id}-phone`}
          type="tel"
          autoComplete="tel"
          maxLength={32}
          placeholder="+91 98765 43210"
          aria-invalid={Boolean(phoneError)}
          aria-describedby={phoneError ? `${id}-phone-error` : undefined}
        />
        {phoneError && <small className="form-error" id={`${id}-phone-error`}>{phoneError}</small>}
      </div>
      <div className="form-field project-logo-field">
        <label htmlFor={`${id}-logo`}>Project logo or image</label>
        <div className="project-logo-picker">
          {logoUrl && (
            <Image className="project-logo-preview" src={logoUrl} alt="Project logo preview" width={52} height={52} unoptimized />
          )}
          <Input
            id={`${id}-logo`}
            ref={fileInput}
            type="file"
            accept={PROJECT_LOGO_CONTENT_TYPES.join(",")}
            aria-invalid={Boolean(fileError)}
            aria-describedby={fileError ? `${id}-logo-error` : `${id}-logo-hint`}
            onChange={chooseImage}
          />
          {(logoUrl || fileError || logo === null) && (
            <Button type="button" variant="secondary" size="sm" onClick={clearImage}>
              {logo === null ? "Undo removal" : logo || fileError ? "Clear selection" : "Remove logo"}
            </Button>
          )}
        </div>
        <small className="field-hint" id={`${id}-logo-hint`}>
          {logo === null ? "The logo will be removed when you save." : "PNG, JPEG, or WebP up to 5 MB."}
        </small>
        {fileError && <small className="form-error" id={`${id}-logo-error`} role="alert">{fileError}</small>}
      </div>
    </fieldset>
  );
}

export function ProjectLogo({ url, className = "project-thumb" }: { url?: string; className?: string }) {
  return (
    <span className={className} aria-hidden="true">
      {url && <Image src={url} alt="" width={48} height={48} unoptimized />}
    </span>
  );
}
