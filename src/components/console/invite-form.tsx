'use client'

import { useApp } from '@/components/app-providers'
import { Caps } from '@/components/ui/caps'
import { SegBar, SegButton } from '@/components/ui/controls'
import type { CreateUserResponse } from '@/lib/api-contract'
import { call } from '@/lib/client-api'
import { cn } from '@/lib/cn'
import { resolveApiMessage } from '@/lib/i18n'
import type { UserV3 } from '@/lib/types'
import { useState } from 'react'

const INTERNAL_DOMAINS = ['@netlog.com.tr', '@polarxp.com', '@netkargo.com']

/**
 * Inline "add user" row. Notably it does NOT take a password: the account is
 * created as `invited` and sets its own via the emailed link. That removes the
 * old panel's readable-password column at the source rather than masking it.
 */
export function InviteForm({
  roles,
  sites,
  onCancel,
  onCreated,
  onError,
}: {
  roles: string[]
  sites: string[]
  onCancel: () => void
  onCreated: (user: UserV3) => void
  onError: (message: string) => void
}) {
  const { t } = useApp()

  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [internalDomain, setInternalDomain] = useState('@netlog.com.tr')
  const [externalDomain, setExternalDomain] = useState('tedarikci.com')
  const [role, setRole] = useState(roles.includes('Editor') ? 'Editor' : (roles[0] ?? 'Viewer'))
  const [org, setOrg] = useState<'internal' | 'external'>('internal')
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const onUsernameChange = (val: string) => {
    if (val.includes('@')) {
      const parts = val.split('@')
      setUsername(parts[0] || '')
      const dom = parts[1]
      if (dom) {
        if (INTERNAL_DOMAINS.includes(`@${dom}`)) {
          setInternalDomain(`@${dom}`)
          setOrg('internal')
        } else {
          setExternalDomain(dom)
          setOrg('external')
        }
      }
    } else {
      setUsername(val)
    }
  }

  const submit = async () => {
    const domain = org === 'internal' ? internalDomain : `@${externalDomain.replace(/^@/, '').trim()}`
    const cleanUsername = username.trim().toLowerCase().replace(/@.*$/, '')

    if (!fullName.trim() || !cleanUsername || (org === 'external' && !externalDomain.trim())) {
      onError(t.errFields)
      return
    }

    const finalEmail = `${cleanUsername}${domain}`

    setBusy(true)
    const res = await call<CreateUserResponse>('/api/users', {
      body: {
        fullName: fullName.trim(),
        username: cleanUsername,
        email: finalEmail,
        role,
        org,
        siteNames: selected,
      },
    })
    setBusy(false)

    if (!res.ok) {
      onError(resolveApiMessage(t, res.messageKey))
      return
    }
    onCreated(res.data.user)
  }

  return (
    <div
      className="flex flex-wrap items-end gap-[10px] rounded-[12px] border border-input bg-surface p-[13px]"
      style={{ animation: 'dtDrop 0.16s ease' }}
    >
      <div className="flex min-w-[132px] flex-1 flex-col gap-[5px]">
        <Caps className="font-mono text-[9px] tracking-[0.12em] text-muted-fg">
          {t.inviteFullName}
        </Caps>
        <input
          type="text"
          placeholder={t.egName}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="h-8 w-full min-w-0 rounded-[8px] border border-input bg-field px-[10px] text-xs text-fg outline-none focus:border-ring"
        />
      </div>

      <div className="flex min-w-[210px] flex-1 flex-col gap-[5px]">
        <Caps className="font-mono text-[9px] tracking-[0.12em] text-muted-fg">
          {t.inviteEmail}
        </Caps>
        <div className="flex min-w-0 items-center overflow-hidden rounded-[8px] border border-input bg-field focus-within:border-ring">
          <input
            type="text"
            placeholder={org === 'external' ? 'tedarikci.yetkilisi' : 'yusuf.aydin'}
            value={username}
            onChange={(e) => onUsernameChange(e.target.value)}
            className="h-8 min-w-0 flex-1 bg-transparent px-[10px] text-xs text-fg outline-none"
          />
          {org === 'internal' ? (
            <select
              value={internalDomain}
              onChange={(e) => setInternalDomain(e.target.value)}
              className="flex h-8 shrink-0 items-center border-l border-input bg-surface px-[6px] font-mono text-[10.5px] text-muted-fg outline-none cursor-pointer hover:text-fg"
              title="Kurumsal E-posta Alan Adı"
            >
              {INTERNAL_DOMAINS.map((dom) => (
                <option key={dom} value={dom}>
                  {dom}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex h-8 shrink-0 items-center border-l border-input bg-surface px-2">
              <span className="font-mono text-[11px] text-muted-fg">@</span>
              <input
                type="text"
                placeholder="firma.com"
                value={externalDomain}
                onChange={(e) => setExternalDomain(e.target.value.replace(/^@/, ''))}
                className="h-full w-28 bg-transparent px-1 font-mono text-[11px] text-fg outline-none placeholder:text-muted-fg/50"
                title="Dış Kullanıcı Alan Adı"
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-[5px]">
        <Caps className="font-mono text-[9px] tracking-[0.12em] text-muted-fg">{t.inviteRole}</Caps>
        <SegBar>
          {roles.map((name) => (
            <SegButton key={name} active={role === name} onClick={() => setRole(name)}>
              {name}
            </SegButton>
          ))}
        </SegBar>
      </div>

      <div className="flex flex-col gap-[5px]">
        <Caps className="font-mono text-[9px] tracking-[0.12em] text-muted-fg">{t.inviteOrg}</Caps>
        <SegBar>
          <SegButton active={org === 'internal'} onClick={() => setOrg('internal')}>
            {t.orgInternal}
          </SegButton>
          <SegButton active={org === 'external'} onClick={() => setOrg('external')}>
            {t.orgExternal}
          </SegButton>
        </SegBar>
      </div>

      <div className="flex w-full flex-col gap-[5px]">
        <Caps className="font-mono text-[9px] tracking-[0.12em] text-muted-fg">
          {t.inviteSites}
        </Caps>
        <div className="flex flex-wrap gap-[6px]">
          {sites.map((site) => {
            const on = selected.includes(site)
            return (
              <button
                key={site}
                type="button"
                onClick={() =>
                  setSelected((prev) => (on ? prev.filter((s) => s !== site) : [...prev, site]))
                }
                className={cn(
                  'flex h-[28px] items-center gap-2 rounded-[7px] border px-[9px] text-[11.5px]',
                  on
                    ? 'border-brand bg-field text-fg'
                    : 'border-border bg-transparent text-muted-fg',
                )}
              >
                <span
                  className={cn(
                    'h-[9px] w-[9px] shrink-0 rounded-[3px] border',
                    on ? 'border-brand bg-brand' : 'border-input',
                  )}
                />
                {site}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex gap-[7px]">
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="h-8 rounded-[8px] bg-primary px-[14px] text-xs font-semibold text-primary-fg hover:opacity-92"
        >
          {t.save}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-8 rounded-[8px] border border-border bg-transparent px-3 text-xs text-muted-fg hover:bg-hover hover:text-fg"
        >
          {t.cancel}
        </button>
      </div>
    </div>
  )
}
