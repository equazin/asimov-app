'use client';

import { useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { useAuthStore } from '@/lib/auth-store';
import { apiGet } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  details: string | null;
  ipAddress: string | null;
  createdAt: string;
  user?: { name: string; email: string };
  tenant?: { name: string };
}

const actionOptions = [
  { value: '', label: 'Todas las acciones' },
  { value: 'login', label: 'Login' },
  { value: 'create', label: 'Crear' },
  { value: 'update', label: 'Actualizar' },
  { value: 'delete', label: 'Eliminar' },
  { value: 'status_change', label: 'Cambio de estado' },
];

const actionVariant: Record<string, 'info' | 'success' | 'warning' | 'danger' | 'default'> = {
  login: 'info',
  create: 'success',
  update: 'warning',
  delete: 'danger',
  status_change: 'warning',
};

export default function AuditPage() {
  const token = useAuthStore((s) => s.accessToken);
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const params = actionFilter ? `?action=${actionFilter}` : '';
    apiGet<{ success: boolean; data: AuditEntry[] }>(`/master/tenants/audit${params}`, token)
      .then((res) => setLogs(res.data))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [token, actionFilter]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Auditoría</h1>
          <p className="text-sm text-ink-500">Registro de actividad de la plataforma</p>
        </div>
        <Select
          options={actionOptions}
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="w-48"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-ink-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50">
              <th className="px-6 py-3 text-left font-medium text-ink-600">Fecha</th>
              <th className="px-6 py-3 text-left font-medium text-ink-600">Acción</th>
              <th className="px-6 py-3 text-left font-medium text-ink-600">Entidad</th>
              <th className="px-6 py-3 text-left font-medium text-ink-600">Usuario</th>
              <th className="px-6 py-3 text-left font-medium text-ink-600">Empresa</th>
              <th className="px-6 py-3 text-left font-medium text-ink-600">Detalles</th>
              <th className="px-6 py-3 text-left font-medium text-ink-600">IP</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center">
                  <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-ion-500 border-t-transparent" />
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-ink-500">
                  <ScrollText className="mx-auto mb-2 h-8 w-8 text-ink-300" />
                  No hay registros de auditoría
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-b border-ink-100">
                  <td className="px-6 py-3 text-ink-700 whitespace-nowrap">
                    {formatDateTime(log.createdAt)}
                  </td>
                  <td className="px-6 py-3">
                    <Badge variant={actionVariant[log.action] ?? 'default'}>
                      {log.action}
                    </Badge>
                  </td>
                  <td className="px-6 py-3 text-ink-700">{log.entity}</td>
                  <td className="px-6 py-3 text-ink-700">{log.user?.name ?? '-'}</td>
                  <td className="px-6 py-3 text-ink-700">{log.tenant?.name ?? '-'}</td>
                  <td className="px-6 py-3 text-ink-500 max-w-xs truncate">{log.details ?? '-'}</td>
                  <td className="px-6 py-3 text-ink-500 font-mono text-xs">{log.ipAddress ?? '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
