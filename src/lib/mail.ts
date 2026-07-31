/**
 * Delivery seam for the three transactional messages the auth flows send.
 *
 * There is no SMTP wiring in this step — the handover order puts real delivery
 * outside steps 1–5, and inventing a provider here would be a decision nobody
 * asked for. Instead every message is logged with its link so the flows are
 * fully exercisable end to end, and swapping in a transport is one file.
 *
 * The raw token appears here and nowhere else: not in the API response, not in
 * the audit trail, not in the database.
 */

export function appUrl(path: string): string {
  const base = process.env.APP_URL ?? 'http://localhost:3000';
  return new URL(path, base).toString();
}

interface Envelope {
  to: string;
  subject: string;
  body: string;
}

async function send(envelope: Envelope): Promise<void> {
  const transport = process.env.MAIL_TRANSPORT ?? 'console';
  if (transport !== 'console') {
    throw new Error(`MAIL_TRANSPORT="${transport}" has no implementation yet — only "console" is wired.`);
  }
  console.info(
    `\n─── mail ───────────────────────────────────\n` +
      `To:      ${envelope.to}\n` +
      `Subject: ${envelope.subject}\n\n` +
      `${envelope.body}\n` +
      `────────────────────────────────────────────\n`,
  );
}

export async function deliverResetLink(opts: {
  email: string;
  fullName: string;
  token: string;
  expiresAt: Date;
}): Promise<void> {
  const minutes = Math.max(1, Math.round((opts.expiresAt.getTime() - Date.now()) / 60_000));
  await send({
    to: opts.email,
    subject: 'DigitalTwin — password reset',
    body:
      `${opts.fullName},\n\n` +
      `Open this single-use link to set a new password:\n` +
      `${appUrl(`/reset/${opts.token}`)}\n\n` +
      `It expires in ${minutes} minutes. If you did not ask for it, ignore this message — ` +
      `an administrator has been notified of the request.`,
  });
}

export async function deliverInvite(opts: {
  email: string;
  fullName: string;
  token: string;
  temporaryPassword?: string;
  expiresAt: string;
}): Promise<void> {
  const days = Math.max(1, Math.ceil((new Date(opts.expiresAt).getTime() - Date.now()) / 86_400_000));
  await send({
    to: opts.email,
    subject: 'DigitalTwin — your account is ready',
    body:
      `${opts.fullName},\n\n` +
      `An administrator created a DigitalTwin account for you. Open this link to set ` +
      `your password and enrol two-factor authentication:\n` +
      `${appUrl(`/welcome?token=${opts.token}`)}\n\n` +
      (opts.temporaryPassword ? `Temporary password: ${opts.temporaryPassword}\n\n` : '') +
      `The link is valid for ${days} day(s).`,
  });
}

export async function deliverRequestReceipt(opts: { email: string; fullName: string }): Promise<void> {
  await send({
    to: opts.email,
    subject: 'DigitalTwin — account request received',
    body:
      `${opts.fullName},\n\n` +
      `Your access request is with the administrators. You will get another message ` +
      `with a sign-in link once it is approved.`,
  });
}
