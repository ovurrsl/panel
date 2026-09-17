import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** /console landing page — routes to Overview or Locations based on role permissions */
export default async function ConsoleIndex() {
  const session = await getSession()
  if (!session) redirect('/signin')

  if (session.user.permissions.includes('admin_access')) {
    redirect('/console/overview')
  } else if (session.user.permissions.includes('view_warehouse_addresses')) {
    redirect('/console/locations')
  } else {
    redirect('/')
  }
}

