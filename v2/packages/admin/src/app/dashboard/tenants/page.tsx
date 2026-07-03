'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Search, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { TenantStatusBadge } from '@/components/tenants/tenant-status-badge';
import { useAuthStore } from '@/lib/auth-store';
import { apiGet, apiPost } from '@/lib/api';
import { formatDate } from '@/lib/format';

const emptyForm = {
  tenantName: '',
  ownerName: '',
  ownerEmail: '',
  password: '',
  country: 'AR',
  planTier: 'trial',
};

const planOptions = [
  { value: 'trial', label: 'Trial (14 días)' },
  { value: 'basic', label: 'Basic' },
  { value: 'pro', label: 'Pro' },
  { value: 'enterprise', label: 'Enterprise' },
];

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  cuit: string;
  status: string;
  createdAt: string;
  subscription?: {
    plan: { name: string };
    currentPeriodEnd: string;
  };
  _count?: { users: number };
}

const statusOptions = [
  { value: '', label: 'Todos los estados' },
  { value: 'active', label: 'Activo' },
  { value: 'trial', label: 'Trial' },
  { value: 'read_only', label: 'Solo lectura' },
  { value: 'blocked', label: 'Bloqueado' },
  { value: 'cancelled', label: 'Cancelado' },
];

export default function TenantsPage() {
  const token = useAuthStore((s) => s.accessToken);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [reload, setReload] = useState(0);

  // Alta de empresa
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);

    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);

    apiGet<{ success: boolean; data: TenantRow[] }>(
      `/master/tenants?${params.toString()}`,
      token,
    )
      .then((res) => setTenants(res.data))
      .catch(() => setTenants([]))
      .finally(() => setLoading(false));
  }, [token, search, statusFilter, reload]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setCreating(true);
    setCreateError(null);
    try {
      await apiPost('/master/tenants', form, token);
      setShowCreate(false);
      setForm(emptyForm);
      setReload((n) => n + 1);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'No se pudo crear la empresa');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Empresas</h1>
          <p className="text-sm text-ink-500">Gestión de tenants contratantes</p>
        </div>
        <Button size="md" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          Nueva empresa
        </Button>
      </div>

      <div className="mb-6 flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, CUIT o slug..."
            className="w-full rounded-lg border border-ink-200 bg-white py-2 pl-10 pr-4 text-sm placeholder:text-ink-400 focus:border-ion-500 focus:outline-none focus:ring-1 focus:ring-ion-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          options={statusOptions}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-48"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-ink-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50">
              <th className="px-6 py-3 text-left font-medium text-ink-600">Empresa</th>
              <th className="px-6 py-3 text-left font-medium text-ink-600">CUIT</th>
              <th className="px-6 py-3 text-left font-medium text-ink-600">Plan</th>
              <th className="px-6 py-3 text-left font-medium text-ink-600">Estado</th>
              <th className="px-6 py-3 text-left font-medium text-ink-600">Vencimiento</th>
              <th className="px-6 py-3 text-left font-medium text-ink-600">Usuarios</th>
              <th className="px-6 py-3 text-left font-medium text-ink-600">Alta</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-ink-500">
                  <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-ion-500 border-t-transparent" />
                </td>
              </tr>
            ) : tenants.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-ink-500">
                  <Building2 className="mx-auto mb-2 h-8 w-8 text-ink-300" />
                  No se encontraron empresas
                </td>
              </tr>
            ) : (
              tenants.map((t) => (
                <tr key={t.id} className="border-b border-ink-100 hover:bg-ink-50 transition-colors">
                  <td className="px-6 py-4">
                    <Link href={`/dashboard/tenants/${t.id}`} className="font-medium text-ink-900 hover:text-ion-600">
                      {t.name}
                    </Link>
                    <p className="text-xs text-ink-500">{t.slug}</p>
                  </td>
                  <td className="px-6 py-4 text-ink-700">{t.cuit}</td>
                  <td className="px-6 py-4 text-ink-700">{t.subscription?.plan.name ?? '-'}</td>
                  <td className="px-6 py-4">
                    <TenantStatusBadge status={t.status} />
                  </td>
                  <td className="px-6 py-4 text-ink-700">
                    {t.subscription?.currentPeriodEnd
                      ? formatDate(t.subscription.currentPeriodEnd)
                      : '-'}
                  </td>
                  <td className="px-6 py-4 text-ink-700">{t._count?.users ?? 0}</td>
                  <td className="px-6 py-4 text-ink-700">{formatDate(t.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4"
          onClick={() => !creating && setShowCreate(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-lg font-bold text-ink-900">Nueva empresa</h2>
            <p className="mb-4 text-sm text-ink-500">
              Crea el tenant, su usuario dueño y la suscripción inicial.
            </p>
            <form onSubmit={handleCreate} className="space-y-3">
              <Input
                label="Nombre de la empresa"
                value={form.tenantName}
                onChange={(e) => setForm({ ...form, tenantName: e.target.value })}
                required
              />
              <Input
                label="Nombre del dueño"
                value={form.ownerName}
                onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                required
              />
              <Input
                label="Email del dueño"
                type="email"
                value={form.ownerEmail}
                onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })}
                required
              />
              <Input
                label="Contraseña inicial"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
              <Select
                label="Plan"
                options={planOptions}
                value={form.planTier}
                onChange={(e) => setForm({ ...form, planTier: e.target.value })}
              />
              {createError && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{createError}</p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowCreate(false)}
                  disabled={creating}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating ? 'Creando…' : 'Crear empresa'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
