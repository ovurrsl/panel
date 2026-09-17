import { ConsoleShell } from '@/components/console/console-shell'
import { TabContent } from '@/components/console/tab-content'
import { getSession } from '@/lib/auth/session'
import { isConsoleTab, tabPermission } from '@/lib/console-tabs'
import { notFound, redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * Every console tab is its own address (`/console/users`), so back/forward work
 * and a link opens where it says it does. An unknown tab is a 404 rather than a
 * silent redirect to Overview — a typo in a shared link should say so.
 */
export default async function ConsoleTabPage({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params
  if (!isConsoleTab(tab)) notFound()

  const session = await getSession()
  if (!session) redirect('/signin')

  // Allowed into console if the user has admin_access OR has permission for this specific tab
  const required = tabPermission(tab)
  const isAllowed =
    session.user.permissions.includes('admin_access') ||
    (required && session.user.permissions.includes(required))

  if (!isAllowed) {
    if (session.user.permissions.includes('view_warehouse_addresses')) {
      redirect('/console/locations')
    } else {
      redirect('/')
    }
  }

  // Permission is re-checked here: a hand-typed URL to a tab the role cannot see lands on fallback
  if (required && !session.user.permissions.includes(required) && !session.user.permissions.includes('admin_access')) {
    redirect(session.user.permissions.includes('view_warehouse_addresses') ? '/console/locations' : '/console/overview')
  }

  return (
    <ConsoleShell user={session.user} tab={tab}>
      <TabContent tab={tab} />
    </ConsoleShell>
  )
}
