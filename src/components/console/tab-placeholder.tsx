'use client';

import { useApp } from '@/components/app-providers';
import { TAB_META, tabLabel, type ConsoleTab } from '@/lib/console-tabs';
import { format } from '@/lib/i18n';
import { Caps } from '@/components/ui/caps';

/**
 * Every console tab routes, guards and renders its own chrome today; the content
 * arrives in steps 6–8 of the handover order. This placeholder states which step
 * owns each tab rather than showing an empty panel, so the shell reads as
 * deliberate rather than broken.
 *
 * Replace one call site at a time — the shell, the rail, the guards and the
 * animation are already what the finished tabs will sit inside.
 */
export function TabPlaceholder({ tab }: { tab: ConsoleTab }) {
  const { t } = useApp();
  const step = TAB_META[tab].step;

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="m-0 text-[18px] font-semibold tracking-[-0.01em]">{tabLabel(t, tab)}</h2>
        <p className="m-0 text-[12.5px] text-muted-fg">{leadFor(t, tab)}</p>
      </header>

      <div className="flex flex-col gap-2 rounded-[14px] border border-dashed border-input bg-surface p-6">
        <Caps className="font-mono text-[9px] tracking-[0.14em] text-muted-fg">{t.c.comingSoon}</Caps>
        <p className="m-0 max-w-[62ch] text-[12.5px] leading-[1.6] text-muted-fg text-pretty">
          {format(t.c.comingSoonLead, { step })}
        </p>
      </div>
    </section>
  );
}

function leadFor(t: ReturnType<typeof useApp>['t'], tab: ConsoleTab): string {
  switch (tab) {
    case 'overview':
      return t.c.overviewLead;
    case 'roles':
      return t.c.rolesLead;
    case 'audit':
      return t.c.auditLead;
    case 'updates':
      return t.c.changelogLead;
    case 'sessions':
      return t.c.sessionsTitle;
    default:
      return t.c.sysStatusLead;
  }
}
