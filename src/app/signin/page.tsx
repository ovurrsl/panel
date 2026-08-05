import { SignInScreen } from '@/components/auth/sign-in-screen'
import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

export const dynamic = 'force-dynamic'

export default async function SignInPage() {
  // An already-signed-in visitor is bounced to the console rather than shown a
  // form that would just re-authenticate them.
  const session = await getSession({ touch: false })
  if (session && !session.mfaPending && !session.user.mustChangePassword)
    redirect('/console/overview')

  return (
    <Suspense fallback={null}>
      <SignInScreen />
    </Suspense>
  )
}
