'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { vstudioApi } from '@vstudio/api-client'
import { Button } from 'sanui'
import { AuthStory } from '../../components/auth-story'

const schema = z.object({ organizationName: z.string().trim().min(2, 'Enter your organization name.'), organizationSlug: z.string().trim().min(2).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens.'), name: z.string().trim().min(2, 'Enter your name.'), email: z.string().email('Enter a valid email address.'), password: z.string().min(12, 'Use at least 12 characters.') })
type Values = z.infer<typeof schema>

export default function RegisterPage() {
  const router = useRouter(); const [serverError, setServerError] = useState('')
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { organizationName: '', organizationSlug: '', name: '', email: '', password: '' } })
  function setOrganizationName(value: string) { form.setValue('organizationName', value, { shouldValidate: true }); form.setValue('organizationSlug', value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), { shouldValidate: true }) }
  async function submit(values: Values) { setServerError(''); try { await vstudioApi.register(values); router.replace('/') } catch (error) { setServerError(error instanceof Error ? error.message : 'Registration failed.') } }
  return (
    <main className="auth-page auth-layout register-page">
      <AuthStory />
      <section className="auth-panel">
        <div className="auth-card">
          <p className="page-eyebrow">Start your workspace</p>
          <h1>Create a VStudio account</h1>
          <p className="auth-description">Set up your organization and invite your team when you’re ready.</p>
          <form className="auth-form" onSubmit={form.handleSubmit(submit)}>
            <div className="form-field">
              <label htmlFor="org">Organization name</label>
              <input id="org" autoComplete="organization" placeholder="Santhosh Properties" {...form.register('organizationName', { onChange: event => setOrganizationName(event.target.value) })} />
              {form.formState.errors.organizationName && <small className="form-error">{form.formState.errors.organizationName.message}</small>}
            </div>
            <div className="form-field">
              <label htmlFor="slug">Workspace URL</label>
              <input id="slug" autoComplete="url" placeholder="santhosh-properties" {...form.register('organizationSlug')} />
              {form.formState.errors.organizationSlug && <small className="form-error">{form.formState.errors.organizationSlug.message}</small>}
            </div>
            <div className="form-field">
              <label htmlFor="name">Your name</label>
              <input id="name" autoComplete="name" {...form.register('name')} />
              {form.formState.errors.name && <small className="form-error">{form.formState.errors.name.message}</small>}
            </div>
            <div className="form-field">
              <label htmlFor="email">Work email</label>
              <input id="email" type="email" autoComplete="email" {...form.register('email')} />
              {form.formState.errors.email && <small className="form-error">{form.formState.errors.email.message}</small>}
            </div>
            <div className="form-field">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" autoComplete="new-password" {...form.register('password')} />
              <small className="field-hint">Use at least 12 characters.</small>
              {form.formState.errors.password && <small className="form-error">{form.formState.errors.password.message}</small>}
            </div>
            {serverError && <p className="form-error" role="alert">{serverError}</p>}
            <Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? 'Creating workspace…' : 'Create workspace'}</Button>
          </form>
          <p className="auth-switch">Already have an account? <Link href="/login">Sign in</Link></p>
        </div>
        <footer className="auth-panel-footer"><span>© 2026 VStudio</span><span>Property, organized.</span></footer>
      </section>
    </main>
  )
}
