import { redirect } from 'next/navigation';
import { MfaSetupScreen } from '@/components/auth/mfa-setup-screen';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function MfaSetupPage() {
  // Enrolment is reachable with a half-open session on purpose: that is exactly
  // the state a first-time user is in when MFA is mandatory.
  const session = await getSession({ touch: false });
  if (!session) redirect('/signin');

  return <MfaSetupScreen />;
}
