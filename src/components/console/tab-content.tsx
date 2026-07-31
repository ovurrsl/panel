'use client';

import { AuditTab } from '@/components/console/audit-tab';
import { IntegrationsTab } from '@/components/console/integrations-tab';
import { JobsTab } from '@/components/console/jobs-tab';
import { LogsTab } from '@/components/console/logs-tab';
import { OverviewTab } from '@/components/console/overview-tab';
import { RolesTab } from '@/components/console/roles-tab';
import { SettingsTab } from '@/components/console/settings-tab';
import { SitesTab } from '@/components/console/sites-tab';
import { UpdatesTab } from '@/components/console/updates-tab';
import { SessionsTab } from '@/components/console/sessions-tab';
import { TabPlaceholder } from '@/components/console/tab-placeholder';
import { UsersTab } from '@/components/console/users-tab';
import type { ConsoleTab } from '@/lib/console-tabs';

/**
 * One switch, so adding a tab in a later handover step is a single edit here
 * rather than a change to the route, the shell and the rail.
 */
export function TabContent({ tab }: { tab: ConsoleTab }) {
  switch (tab) {
    case 'users':
      return <UsersTab />;
    case 'roles':
      return <RolesTab />;
    case 'sessions':
      return <SessionsTab />;
    case 'sites':
      return <SitesTab />;
    case 'jobs':
      return <JobsTab />;
    case 'integrations':
      return <IntegrationsTab />;
    case 'settings':
      return <SettingsTab />;
    case 'overview':
      return <OverviewTab />;
    case 'logs':
      return <LogsTab />;
    case 'audit':
      return <AuditTab />;
    case 'updates':
      return <UpdatesTab />;
    default:
      return <TabPlaceholder tab={tab} />;
  }
}
