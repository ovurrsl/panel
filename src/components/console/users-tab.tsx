'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Search } from 'lucide-react';
import { useApp } from '@/components/app-providers';
import { Caps } from '@/components/ui/caps';
import { SegBar, SegButton } from '@/components/ui/controls';
import { Toast } from '@/components/ui/feedback';
import { AssignDialog } from '@/components/console/assign-dialog';
import { InviteForm } from '@/components/console/invite-form';
import { UserDrawer } from '@/components/console/user-drawer';
import { call } from '@/lib/client-api';
import type { AccessRequest, UserV3 } from '@/lib/types';
import type { PendingRequestsResponse, UsersListResponse } from '@/lib/api-contract';
import { resolveApiMessage } from '@/lib/i18n';
import { useBreakpoint } from '@/lib/hooks/use-breakpoint';
import { cn } from '@/lib/cn';

type SortKey = 'name' | 'email' | 'username' | 'role' | 'status';
type ListState = 'loading' | 'ready' | 'error';

/** Desktop grid: name, email, username, role, 2FA, status, actions. */
const COLS = 'minmax(150px,1.4fr) minmax(190px,1.7fr) minmax(104px,0.9fr) 96px 44px 92px 150px';

export function UsersTab() {
  const { t, lang } = useApp();
  const { isMobile } = useBreakpoint();

  const [state, setState] = useState<ListState>('loading');
  const [data, setData] = useState<UsersListResponse | null>(null);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [sort, setSort] = useState<SortKey>('name');
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [inviting, setInviting] = useState(false);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [approving, setApproving] = useState<AccessRequest | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  const notify = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    setToast({ message, tone });
    setTimeout(() => setToast(null), 2600);
  }, []);

  const load = useCallback(async () => {
    setState((prev) => (prev === 'ready' ? 'ready' : 'loading'));
    const params = new URLSearchParams({
      search,
      role: roleFilter,
      sort,
      direction,
      page: String(page),
      pageSize: String(pageSize),
      lang,
    });
    const res = await call<UsersListResponse>(`/api/users?${params}`);
    if (!res.ok) {
      setErrorText(resolveApiMessage(t, res.messageKey));
      setState('error');
      return;
    }
    setData(res.data);
    setState('ready');
  }, [search, roleFilter, sort, direction, page, pageSize, lang, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void call<PendingRequestsResponse>('/api/requests').then((res) => {
      if (res.ok) setRequests(res.data.requests);
    });
  }, []);

  // Filter and sort changes reset to page 1 — otherwise a narrowed result set
  // leaves you stranded on a page that no longer exists.
  useEffect(() => {
    setPage(1);
  }, [search, roleFilter, sort, direction, pageSize]);

  const users = data?.users ?? [];
  const canEdit = data?.canEdit ?? false;
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const countLabel = useMemo(() => {
    if (state === 'loading') return `${t.c.search}…`;
    if (state === 'error') return t.loadFailedTitle;
    const parts = [`${total} ${t.c.of} ${data?.totalUnfiltered ?? 0} ${t.c.accounts}`];
    if (data?.without2fa) parts.push(`${data.without2fa} ${t.c.without2fa}`);
    return parts.join(' · ');
  }, [state, total, data, t]);

  const toggleSort = (key: SortKey) => {
    if (sort === key) setDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSort(key);
      setDirection('asc');
    }
  };

  const headers: Array<{ key: SortKey | null; label: string }> = [
    { key: 'name', label: t.c.colUser },
    { key: 'email', label: t.c.colEmail },
    { key: 'username', label: t.c.colUsername },
    { key: 'role', label: t.c.colRole },
    { key: null, label: t.c.col2fa },
    { key: 'status', label: t.c.colStatus },
    { key: null, label: t.colInvite },
  ];

  const decideRequest = useCallback(
    async (request: AccessRequest, decision: 'reject') => {
      const res = await call(`/api/requests/${request.id}/${decision}`, { body: {} });
      if (!res.ok) {
        notify(resolveApiMessage(t, res.messageKey), 'error');
        return;
      }
      setRequests((prev) => prev.filter((r) => r.id !== request.id));
    },
    [notify, t],
  );

  return (
    <section className="flex min-w-0 flex-col gap-[14px]" style={{ animation: 'dtFade 0.2s ease' }}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-[2px]">
          <h2 className="m-0 text-[15.5px] font-semibold tracking-[-0.01em]">{t.c.userAccounts}</h2>
          <p className="m-0 text-xs text-muted-fg">{countLabel}</p>
        </div>

        <div className="flex flex-wrap items-center gap-[7px]">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-[9px] h-3 w-3 text-muted-fg" strokeWidth={2.2} />
            <input
              type="text"
              placeholder={t.c.userSearchPh}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-[30px] w-[196px] min-w-0 rounded-[8px] border border-input bg-field pl-[26px] pr-[10px] text-xs text-fg outline-none focus:border-ring focus:shadow-[0_0_0_3px_var(--dt-hover)]"
            />
          </div>

          <SegBar>
            {['All', ...(data?.roles ?? [])].map((role) => (
              <SegButton key={role} active={roleFilter === role} onClick={() => setRoleFilter(role)}>
                {role === 'All' ? t.c.filterAll : role}
              </SegButton>
            ))}
          </SegBar>

          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setInviting((v) => !v)}
            className="h-[30px] shrink-0 rounded-[8px] bg-primary px-[13px] text-xs font-semibold text-primary-fg shadow-e2 hover:opacity-92"
          >
            {inviting ? t.c.closeForm : t.c.addUser}
          </button>
        </div>
      </header>

      {state === 'ready' && !canEdit ? (
        <div className="flex min-w-0 items-center gap-[9px] rounded-[10px] border border-border bg-surface px-3 py-2">
          <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-destructive" />
          <span className="shrink-0 text-[11.5px] font-semibold">{t.c.readOnly}</span>
          <span className="min-w-0 text-[11.5px] text-muted-fg text-pretty">{t.c.readOnlyLead}</span>
        </div>
      ) : null}

      {requests.length > 0 ? (
        <div className="min-w-0 overflow-hidden rounded-[12px] border border-brand bg-surface">
          <div className="flex items-center gap-2 border-b border-border-soft px-3 py-2">
            <span
              className="h-[5px] w-[5px] shrink-0 rounded-full bg-brand"
              style={{ animation: 'dtPulse 2s ease infinite' }}
            />
            <Caps className="font-mono text-[9px] tracking-[0.12em] text-muted-fg">
              {`${requests.length} ${t.c.requestsAwaiting}`}
            </Caps>
          </div>
          {requests.map((request) => (
            <div
              key={request.id}
              className="flex min-w-0 flex-wrap items-center gap-[11px] border-b border-border-soft px-3 py-[10px] last:border-b-0"
            >
              <div className="flex min-w-[150px] flex-1 flex-col gap-[2px]">
                <span className="truncate text-[12.5px] font-medium">{request.fullName}</span>
                <span className="truncate font-mono text-[10px] text-muted-fg">
                  {request.email} · {request.department} · {request.requestedRole}
                </span>
              </div>
              <span className="min-w-[140px] flex-1 text-[11.5px] text-muted-fg text-pretty">
                {request.note ?? ''}
              </span>
              <div className="flex shrink-0 items-center gap-[6px]">
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setApproving(request)}
                  className="h-[26px] rounded-[6px] bg-primary px-[10px] text-[11px] font-semibold text-primary-fg hover:opacity-92"
                >
                  {t.c.approveAs} {request.requestedRole}
                </button>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => void decideRequest(request, 'reject')}
                  className="h-[26px] rounded-[6px] border border-destructive bg-transparent px-[10px] text-[11px] text-destructive hover:bg-hover"
                >
                  {t.c.reject}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {inviting ? (
        <InviteForm
          roles={data?.roles ?? []}
          sites={data?.sites ?? []}
          onCancel={() => setInviting(false)}
          onCreated={(user) => {
            setInviting(false);
            notify(`${user.email} ${t.invitedToast}`);
            void load();
          }}
          onError={(message) => notify(message, 'error')}
        />
      ) : null}

      <div
        className={cn(
          'min-w-0 rounded-[12px] border border-border',
          isMobile ? 'overflow-hidden' : 'overflow-x-auto',
        )}
      >
        {!isMobile ? (
          <div
            className="grid h-[31px] items-center gap-[10px] border-b border-border bg-surface px-3 font-mono text-[8.5px] tracking-[0.12em] text-muted-fg"
            style={{ gridTemplateColumns: COLS, minWidth: 900 }}
          >
            {headers.map((header, index) => (
              <button
                key={`${header.label}-${index}`}
                type="button"
                disabled={header.key === null}
                onClick={() => header.key && toggleSort(header.key)}
                className="flex items-center gap-1 bg-transparent text-left disabled:opacity-100"
              >
                <Caps>{header.label}</Caps>
                {header.key && sort === header.key ? (
                  direction === 'asc' ? (
                    <ChevronUp className="h-[10px] w-[10px] shrink-0 text-brand-fg" strokeWidth={3} />
                  ) : (
                    <ChevronDown className="h-[10px] w-[10px] shrink-0 text-brand-fg" strokeWidth={3} />
                  )
                ) : null}
              </button>
            ))}
          </div>
        ) : null}

        {state === 'loading' ? <SkeletonRows isMobile={isMobile} /> : null}

        {state === 'error' ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10">
            <AlertTriangle className="h-[22px] w-[22px] text-destructive" strokeWidth={1.7} />
            <span className="text-[12.5px] font-semibold">{t.loadFailedTitle}</span>
            <span className="max-w-[340px] text-center text-[11.5px] text-muted-fg text-pretty">
              {errorText ?? t.loadFailedLead}
            </span>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-1 h-7 rounded-[8px] border border-input bg-field px-3 text-[11.5px] font-medium text-fg hover:bg-hover"
            >
              {t.retry}
            </button>
          </div>
        ) : null}

        {state === 'ready' && users.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10">
            <Search className="h-[22px] w-[22px] text-muted-fg" strokeWidth={1.6} />
            <span className="text-[12.5px] font-semibold">{t.noUsersMatch}</span>
            <span className="text-center text-[11.5px] text-muted-fg">{t.emptyHint}</span>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setRoleFilter('All');
              }}
              className="mt-1 h-7 rounded-[8px] border border-input bg-field px-3 text-[11.5px] font-medium text-fg hover:bg-hover"
            >
              {t.clearFilters}
            </button>
          </div>
        ) : null}

        {state === 'ready' &&
          users.map((user) =>
            isMobile ? (
              <UserCard key={user.id} user={user} onOpen={() => setDrawerId(user.id)} />
            ) : (
              <UserRow key={user.id} user={user} onOpen={() => setDrawerId(user.id)} />
            ),
          )}

        {state === 'ready' && users.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-border px-3 py-2">
            <Caps className="whitespace-nowrap font-mono text-[9.5px] tracking-[0.08em] text-muted-fg">
              {`${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} ${t.c.of} ${total} ${t.c.accounts}`}
            </Caps>
            <span className="min-w-0 flex-1" />

            <div className="flex shrink-0 items-center gap-[6px]">
              <Caps className="font-mono text-[9px] tracking-[0.1em] text-muted-fg">{t.c.rows}</Caps>
              <SegBar>
                {[10, 20, 50].map((size) => (
                  <SegButton key={size} active={pageSize === size} onClick={() => setPageSize(size)}>
                    {String(size)}
                  </SegButton>
                ))}
              </SegBar>
            </div>

            <div className="flex shrink-0 items-center gap-[6px]">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] border border-border bg-field text-fg hover:bg-hover"
                aria-label={t.a11yPrevPage}
              >
                <ChevronLeft className="h-3 w-3" strokeWidth={2.5} />
              </button>
              <span className="whitespace-nowrap font-mono text-[10.5px] text-fg">
                {page} / {pageCount}
              </span>
              <button
                type="button"
                disabled={page >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] border border-border bg-field text-fg hover:bg-hover"
                aria-label={t.a11yNextPage}
              >
                <ChevronRight className="h-3 w-3" strokeWidth={2.5} />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {drawerId ? (
        <UserDrawer
          userId={drawerId}
          onClose={() => setDrawerId(null)}
          onChanged={() => void load()}
          notify={notify}
        />
      ) : null}

      {approving ? (
        <AssignDialog
          request={approving}
          roles={data?.roles ?? []}
          sites={data?.sites ?? []}
          onCancel={() => setApproving(null)}
          onDone={(email) => {
            setRequests((prev) => prev.filter((r) => r.id !== approving.id));
            setApproving(null);
            notify(`${email} ${t.invitedToast}`);
            void load();
          }}
          onError={(message) => notify(message, 'error')}
        />
      ) : null}

      {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}
    </section>
  );
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toLocaleUpperCase('tr');
}

function UserRow({ user, onOpen }: { user: UserV3; onOpen: () => void }) {
  const { t } = useApp();

  return (
    <div
      className="grid items-center gap-[10px] border-b border-border-soft px-3 py-[9px] last:border-b-0"
      style={{ gridTemplateColumns: COLS, minWidth: 900 }}
    >
      <button
        type="button"
        onClick={onOpen}
        title={t.a11yUserDetail}
        className="flex min-w-0 items-center gap-2 bg-transparent text-left hover:opacity-75"
      >
        <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] bg-hover text-[9px] font-semibold text-muted-fg">
          {initialsOf(user.name)}
        </span>
        <span className="truncate text-[12.5px] font-medium underline decoration-transparent underline-offset-[3px]">
          {user.name}
        </span>
        {user.org === 'external' ? (
          <Caps className="shrink-0 rounded-[4px] border border-border bg-field px-[5px] py-px font-mono text-[8px] tracking-[0.1em] text-muted-fg">
            {t.orgExternal.split(' ')[0]}
          </Caps>
        ) : null}
      </button>

      <span className="truncate font-mono text-[11px] text-muted-fg">{user.email}</span>
      <span className="truncate font-mono text-[11px] text-muted-fg">{user.username}</span>
      <span className="truncate text-[11.5px]">{user.role}</span>
      <span className={cn('font-mono text-[10px]', user.mfa === 'On' ? 'text-fg' : 'text-muted-fg')}>
        {user.mfa === 'On' ? t.c.mfaOn : t.c.mfaOff}
      </span>
      <StatusBadge user={user} />
      <InviteBadge user={user} />
    </div>
  );
}

/** Below 700 px the row becomes a labelled card — values never read unlabelled. */
function UserCard({ user, onOpen }: { user: UserV3; onOpen: () => void }) {
  const { t } = useApp();

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-col gap-2 border-b border-border-soft bg-transparent px-3 py-3 text-left last:border-b-0"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] bg-hover text-[10px] font-semibold text-muted-fg">
          {initialsOf(user.name)}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{user.name}</span>
        <StatusBadge user={user} />
      </div>
      <span className="truncate font-mono text-[11px] text-muted-fg">{user.email}</span>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-fg">
        <span>
          {t.c.colUsername} <span className="font-mono text-fg">{user.username}</span>
        </span>
        <span>
          {t.c.colRole} <span className="text-fg">{user.role}</span>
        </span>
        <span>
          {t.c.col2fa} <span className="text-fg">{user.mfa === 'On' ? t.c.mfaOn : t.c.mfaOff}</span>
        </span>
      </div>
    </button>
  );
}

function StatusBadge({ user }: { user: UserV3 }) {
  const { t } = useApp();
  const label =
    user.status === 'Invited' ? t.invitedLbl : user.status === 'Active' ? t.c.statusActive : t.c.statusInactive;

  return (
    <span
      className={cn(
        'flex w-fit shrink-0 items-center gap-[6px] rounded-[5px] border px-[6px] py-px text-[10.5px]',
        user.status === 'Invited'
          ? 'border-brand text-brand-fg'
          : user.status === 'Active'
            ? 'border-border text-fg'
            : 'border-border text-muted-fg',
      )}
    >
      <span
        className={cn(
          'h-[5px] w-[5px] rounded-full',
          user.status === 'Invited' ? 'bg-brand' : user.status === 'Active' ? 'bg-ok' : 'bg-muted-fg',
        )}
        style={user.status === 'Active' ? { animation: 'dtPulse 2s ease infinite' } : undefined}
      />
      {label}
    </span>
  );
}

/** Days-left badge on an invited row, so an expired invite is visible in the list. */
function InviteBadge({ user }: { user: UserV3 }) {
  const { t } = useApp();
  if (user.status !== 'Invited' || !user.invitation) return <span />;

  const days = Math.max(0, Math.ceil((new Date(user.invitation.expiresAt).getTime() - Date.now()) / 86_400_000));
  const expired = user.invitation.state === 'expired';

  return (
    <span className={cn('font-mono text-[10px]', expired ? 'text-destructive' : 'text-muted-fg')}>
      {expired ? t.invExpired : `${days} ${t.invLeftFmt}`}
    </span>
  );
}

function SkeletonRows({ isMobile }: { isMobile: boolean }) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-border-soft px-3"
          style={{ height: isMobile ? 64 : 44 }}
        >
          {[140, 200, 90].map((width) => (
            <span
              key={width}
              className="h-[9px] rounded bg-hover"
              style={{ width, animation: 'dtShimmer 1.4s ease infinite' }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
