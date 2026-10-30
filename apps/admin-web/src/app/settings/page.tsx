'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { vstudioApi } from '@vstudio/api-client'
import { Badge, Button } from 'sanui'
import { AppShell } from '../../components/app-shell'

const schema = z.object({
  name: z.string().trim().min(2, 'Enter your organization name.'),
  slug: z.string().trim().min(2, 'Enter a workspace slug.').regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens.'),
})

type Values = z.infer<typeof schema>

export default function SettingsPage() {
  const [tab, setTab] = useState<'organization' | 'members' | 'public' | 'api'>('organization')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: '', slug: '' } })

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const account = await vstudioApi.me()
        if (!active) return
        form.reset({ name: account.organization.name, slug: account.organization.slug })
      } catch (error) {
        if (!active) return
        setStatus(error instanceof Error ? error.message : 'Unable to load organization settings.')
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [form])

  async function submit(values: Values) {
    setStatus('')
    try {
      await vstudioApi.updateOrganization({ name: values.name, slug: values.slug })
      setStatus('Organization settings saved.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The organization settings could not be saved.')
    }
  }

  return <AppShell><div className="settings-page"><div className="page-title-row"><div><p className="page-eyebrow">Workspace</p><h1 className="page-title">Settings</h1><p className="page-subtitle">Manage organization details, access, and public map defaults.</p></div></div><section className="surface-card settings-card"><nav className="settings-tabs" aria-label="Settings sections">{([['organization', 'Organization'], ['members', 'Members & roles'], ['public', 'Public maps'], ['api', 'API keys']] as const).map(([id, label]) => <button type="button" key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>{label}</button>)}</nav><div className="settings-content">{tab === 'organization' && <><h2>Organization profile</h2><p>These details identify your VStudio workspace.</p><form onSubmit={form.handleSubmit(submit)} className="settings-form"><div className="form-grid"><div className="form-field"><label htmlFor="org-name">Organization name</label><input id="org-name" disabled={loading} {...form.register('name')} /></div><div className="form-field"><label htmlFor="org-slug">Workspace slug</label><input id="org-slug" disabled={loading} {...form.register('slug')} /></div></div>{form.formState.errors.name && <small className="form-error">{form.formState.errors.name.message}</small>}{form.formState.errors.slug && <small className="form-error">{form.formState.errors.slug.message}</small>}{status && <p className="form-status" role="status">{status}</p>}<div className="form-actions"><Button type="submit" disabled={loading || form.formState.isSubmitting}>{form.formState.isSubmitting ? 'Saving…' : 'Save changes'}</Button></div></form></>}{tab === 'members' && <><h2>Members & roles</h2><p>Grant the minimum access each teammate needs.</p><div className="member-row"><span className="user-avatar">SJ</span><span className="member-identity"><strong>San Jose</strong><small>san@example.com</small></span><Badge>Owner</Badge></div><Button variant="secondary" onClick={() => window.alert('Invitations are managed by the API invitation workflow.')}>＋ Invite a teammate</Button></>}{tab === 'public' && <><h2>Public map defaults</h2><p>Choose which property details are visible to customers.</p><div className="setting-options"><label className="setting-check"><input type="checkbox" defaultChecked /> <span>Display prices on public maps</span></label><label className="setting-check"><input type="checkbox" defaultChecked /> <span>Display area measurements</span></label><label className="setting-check"><input type="checkbox" /> <span>Display sold units</span></label></div><div className="form-actions"><Button>Save public defaults</Button></div></>}{tab === 'api' && <><h2>API access</h2><p>Use versioned REST endpoints for integrations and automation.</p><code className="api-base">https://api.example.com/api/v1</code><Button variant="secondary" onClick={() => window.alert('Create an API key after the workspace key-management flow is configured.')}>＋ Create API key</Button></>}</div></section><div className="settings-footnote">Your organization’s data is isolated from other VStudio workspaces by backend tenant policies.</div></div></AppShell>
}
