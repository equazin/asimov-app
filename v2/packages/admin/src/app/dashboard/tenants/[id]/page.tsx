'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  Users,
  FileText,
  Lock,
  Unlock,
  Ban,
  Palette,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TenantStatusBadge } from '@/components/tenants/tenant-status-badge';
import { useAuthStore } from '@/lib/auth-store';
import { apiGet, apiPatch } from '@/lib/api';
import { formatCurrency, formatDate, formatDateTime, formatNumber } from '@/lib/format';

interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  cuit: string;
  status: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  logoUrl: string | null;
  primaryColor: string;
  createdAt: string;
  subscription?: {
    id: string;
    status: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    plan: { id: string; name: string; price: number };
    payments: Array<{
      id: string;
      amount: number;
      status: string;
      paidAt: string | null;
      createdAt: string;
    }>;
  };
  usage?: {
    docsThisMonth: number;
    storageUsedMb: number;
  };
  _count?: {
    users: number;
    clients: number;
    products: number;
    documents: number;
  };
}

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const token = useAuthStore((s) => s.accessToken);
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  function fetchTenant() {
    if (!token || !id) return;
    setLoading(true);
    apiGet<{ success: boolean; data: TenantDetail }>(`/master/tenants/${id}`, token)
      .then((res) => setTenant(res.data))
      .catch(() => setTenant(null))
      .finally(() => setLoading(false));
  }

  useEffect(fetchTenant, [token, id]);

  async function handleStatusChange(newStatus: string) {
    if (!token || !id) return;
    setActionLoading(true);
    try {
      await apiPatch(`/master/tenants/${id}/status`, { status: newStatus }, token);
      fetchTenant();
    } catch {
      // silently fail for demo
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-ion-500 border-t-transparent" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="text-center py-12">
        <Building2 className="mx-auto mb-4 h-12 w-12 text-ink-300" />
        <p className="text-ink-500">Empresa no encontrada</p>
        <Button variant="ghost" onClick={() => router.back()} className="mt-4">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Button>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => router.back()}
        className="mb-4 flex items-center gap-2 text-sm text-ink-500 hover:text-ink-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a empresas
      </button>

      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-center gap-4">
          {tenant.logoUrl ? (
            <img src={tenant.logoUrl} alt={tenant.name} className="h-14 w-14 rounded-xl object-cover" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-ion-100 text-ion-600 text-xl font-bold">
              {tenant.name.charAt(0)}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-ink-900">{tenant.name}</h1>
            <p className="text-sm text-ink-500">
              {tenant.slug} &middot; CUIT {tenant.cuit}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <TenantStatusBadge status={tenant.status} />
          {tenant.status === 'active' && (
            <Button
              variant="danger"
              size="sm"
              loading={actionLoading}
              onClick={() => handleStatusChange('blocked')}
            >
              <Lock className="h-4 w-4" /> Bloquear
            </Button>
          )}
          {tenant.status === 'blocked' && (
            <Button
              variant="primary"
              size="sm"
              loading={actionLoading}
              onClick={() => handleStatusChange('active')}
            >
              <Unlock className="h-4 w-4" /> Desbloquear
            </Button>
          )}
          {tenant.status !== 'cancelled' && (
            <Button
              variant="ghost"
              size="sm"
              loading={actionLoading}
              onClick={() => handleStatusChange('cancelled')}
            >
              <Ban className="h-4 w-4" /> Cancelar
            </Button>
          )}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 p-2">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink-900">{tenant._count?.users ?? 0}</p>
              <p className="text-xs text-ink-500">Usuarios</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-50 p-2">
              <Building2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink-900">{tenant._count?.clients ?? 0}</p>
              <p className="text-xs text-ink-500">Clientes</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-50 p-2">
              <FileText className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink-900">{tenant._count?.documents ?? 0}</p>
              <p className="text-xs text-ink-500">Documentos</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-50 p-2">
              <Palette className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink-900">{tenant.usage?.docsThisMonth ?? 0}</p>
              <p className="text-xs text-ink-500">Docs este mes</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Información de la Empresa</CardTitle>
          </CardHeader>
          <dl className="space-y-3 text-sm">
            {[
              ['Email', tenant.email],
              ['Teléfono', tenant.phone || '-'],
              ['Dirección', tenant.address || '-'],
              ['Ciudad', tenant.city || '-'],
              ['Provincia', tenant.province || '-'],
              ['Fecha de alta', formatDateTime(tenant.createdAt)],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <dt className="text-ink-500">{label}</dt>
                <dd className="font-medium text-ink-900">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Suscripción</CardTitle>
            <CardDescription>
              {tenant.subscription
                ? `Plan ${tenant.subscription.plan.name}`
                : 'Sin suscripción activa'}
            </CardDescription>
          </CardHeader>
          {tenant.subscription && (
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-500">Precio</dt>
                <dd className="font-medium text-ink-900">
                  {formatCurrency(tenant.subscription.plan.price)}/mes
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Período actual</dt>
                <dd className="font-medium text-ink-900">
                  {formatDate(tenant.subscription.currentPeriodStart)} —{' '}
                  {formatDate(tenant.subscription.currentPeriodEnd)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Estado</dt>
                <dd>
                  <Badge variant={tenant.subscription.status === 'active' ? 'success' : 'warning'}>
                    {tenant.subscription.status}
                  </Badge>
                </dd>
              </div>
            </dl>
          )}
        </Card>

        {tenant.subscription?.payments && tenant.subscription.payments.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Historial de Pagos</CardTitle>
            </CardHeader>
            <div className="overflow-hidden rounded-lg border border-ink-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-ink-50">
                    <th className="px-4 py-2 text-left font-medium text-ink-600">Fecha</th>
                    <th className="px-4 py-2 text-left font-medium text-ink-600">Monto</th>
                    <th className="px-4 py-2 text-left font-medium text-ink-600">Estado</th>
                    <th className="px-4 py-2 text-left font-medium text-ink-600">Pagado</th>
                  </tr>
                </thead>
                <tbody>
                  {tenant.subscription.payments.map((p) => (
                    <tr key={p.id} className="border-t border-ink-100">
                      <td className="px-4 py-2 text-ink-700">{formatDate(p.createdAt)}</td>
                      <td className="px-4 py-2 font-medium text-ink-900">
                        {formatCurrency(p.amount)}
                      </td>
                      <td className="px-4 py-2">
                        <Badge
                          variant={
                            p.status === 'paid'
                              ? 'success'
                              : p.status === 'pending'
                                ? 'warning'
                                : 'danger'
                          }
                        >
                          {p.status === 'paid' ? 'Pagado' : p.status === 'pending' ? 'Pendiente' : 'Fallido'}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-ink-700">
                        {p.paidAt ? formatDateTime(p.paidAt) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
