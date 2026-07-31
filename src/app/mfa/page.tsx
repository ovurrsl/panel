import { redirect } from 'next/navigation';
import { MfaVerifyScreen } from '@/components/auth/mfa-verify-screen';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function MfaPage() {
  const session = await getSession({ touch: false });
  if (!session) redirect('/signin');
  // Reaching the OTP screen with the step already cleared means the flow is done.
  if (!session.mfaPending) redirect('/console/overview');

  return <MfaVerifyScreen />;
}
