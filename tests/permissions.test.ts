import { describe, expect, it } from 'vitest';
import { allRoles, permissionsForRole } from '@/lib/auth/roles';
import { effectivePermissions } from '@/lib/auth/session';
import { PERMISSIONS, type Permission, type Role } from '@/lib/types';

describe('Permissions & Scoped RBAC', () => {
  it('contains all 15 expected permissions including 3D, collab, and plugin scopes', () => {
    const expected = [
      'admin_access',
      'edit_projects',
      'create_projects',
      'delete_projects',
      'access_settings',
      'view_projects',
      'edit_users',
      'edit_roles',
      'view_logs',
      'scene:view',
      'scene:edit',
      'scene:transform',
      'collab:write',
      'bom:export',
      'plugin:manage',
    ] as const;

    expect(PERMISSIONS).toHaveLength(15);
    for (const p of expected) {
      expect((PERMISSIONS as readonly string[]).includes(p)).toBe(true);
    }
  });

  it('assigns 3D/collab permissions appropriately across system roles', async () => {
    const adminPerms = await permissionsForRole('Admin');
    expect(adminPerms).toHaveLength(15);
    expect(adminPerms.includes('admin_access')).toBe(true);
    expect(adminPerms.includes('scene:edit')).toBe(true);

    const supervisorPerms = await permissionsForRole('Supervisor');
    expect(supervisorPerms.includes('plugin:manage')).toBe(true);
    expect(supervisorPerms.includes('bom:export')).toBe(true);
    expect(supervisorPerms.includes('admin_access')).toBe(false);

    const editorPerms = await permissionsForRole('Editor');
    expect(editorPerms.includes('scene:view')).toBe(true);
    expect(editorPerms.includes('scene:edit')).toBe(true);
    expect(editorPerms.includes('scene:transform')).toBe(true);
    expect(editorPerms.includes('collab:write')).toBe(true);
    expect(editorPerms.includes('bom:export')).toBe(true);
    expect(editorPerms.includes('plugin:manage')).toBe(false);
    expect(editorPerms.includes('edit_users')).toBe(false);

    const viewerPerms = await permissionsForRole('Viewer');
    expect(viewerPerms).toEqual(['view_projects', 'scene:view']);
  });

  it('effectivePermissions isolates site roles from global permissions', async () => {
    // A user with global Viewer role and Editor site assignment on 'site-sakarya'
    const siteRoles: Record<string, Role> = {
      'site-sakarya': 'Editor',
    };

    const perms = await effectivePermissions('Viewer', siteRoles);
    // Must NOT contain edit_projects or delete_projects in global permissions
    expect(perms).toEqual(['view_projects', 'scene:view']);
    expect(perms.includes('edit_projects' as Permission)).toBe(false);
    expect(perms.includes('delete_projects' as Permission)).toBe(false);
  });
});
