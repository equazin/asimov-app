import { Badge } from '@/components/ui/badge';

type TenantStatus = 'active' | 'trial' | 'read_only' | 'blocked' | 'cancelled';

const statusConfig: Record<TenantStatus, { label: string; variant: 'success' | 'info' | 'warning' | 'danger' | 'default' }> = {
  active: { label: 'Activo', variant: 'success' },
  trial: { label: 'Trial', variant: 'info' },
  read_only: { label: 'Solo lectura', variant: 'warning' },
  blocked: { label: 'Bloqueado', variant: 'danger' },
  cancelled: { label: 'Cancelado', variant: 'default' },
};

export function TenantStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status as TenantStatus] ?? { label: status, variant: 'default' as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
