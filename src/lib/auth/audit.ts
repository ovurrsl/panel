import { exec } from '../db';

export type AuditLevel = 'info' | 'warn' | 'error';

/**
 * Append-only trail. Every mutation writes one row; clearing diagnostics never
 * touches this table (section 08). Failures here must not break the request that
 * triggered them — a lost log line is bad, a 500 on a successful sign-in is worse.
 */
export async function audit(entry: {
  actorUserId?: number | null;
  actorLabel: string;
  level: AuditLevel;
  kind: string;
  message: string;
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await exec(
      `INSERT INTO audit_log (actor_user_id, actor_label, level, kind, message, meta)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        entry.actorUserId ?? null,
        entry.actorLabel.slice(0, 64),
        entry.level,
        entry.kind.slice(0, 48),
        entry.message.slice(0, 1024),
        entry.meta ? JSON.stringify(entry.meta) : null,
      ],
    );
  } catch (err) {
    console.error('[audit] write failed:', err);
  }
}
