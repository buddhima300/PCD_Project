import React from 'react';
import { useSessionStore } from '../../hooks/useSessionStore';
import type { Role } from '../../types/domain';
import { Card } from '../ui/Card';
import { PermissionDenied } from '../ui/States';

// UI-level gate only. The backend independently re-validates every request.
export function RequireRole({ roles, children }: {roles: Role[];children: React.ReactNode;}) {
  const user = useSessionStore((s) => s.user);
  if (!user || !roles.includes(user.role)) {
    return (
      <Card>
        <PermissionDenied />
      </Card>);

  }
  return <>{children}</>;
}