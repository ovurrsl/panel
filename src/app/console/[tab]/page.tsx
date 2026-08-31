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

  // Tab-specific permission gate: if the requested tab requires elevated privileges
  // (e.g. 'settings', 'integrations', 'logs') that the user lacks, safely redirect
  // to Overview instead of bouncing back to root.
  const required = tabPermission(tab)
  if (required && !session.user.permissions.includes(required)) {
    redirect('/console/overview')
  }

  return (
    <ConsoleShell user={session.user} tab={tab}>
      <TabContent tab={tab} />
    </ConsoleShell>
  )
}
