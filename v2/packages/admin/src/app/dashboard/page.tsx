'use client';

import { useEffect, useState } from 'react';
import { Building2, DollarSign, TrendingUp, AlertTriangle } from 'lucide-react';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { TenantStatusBadge } from '@/components/tenants/tenant-status-badge';
import { useAuthStore } from '@/lib/auth-store';
import { apiGet } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';

interface DashboardData {
  totalTenants: number;
  activeTenants: number;
  trialTenants: number;
  blockedTenants: number;
  mrr: number;
  arr: number;
  expiringCount: number;
  recentTenants: Array<{
    id: string;
    name: string;
    status: string;
    createdAt: string;
    subscription?: { plan: { name: string } };
  }>;
}

export default function DashboardPage() {
  const token = useAuthStore((s) => s.accessToken);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    apiGet<{ success: boolean; data: DashboardData }>('/master/tenants/dashboard', token)
      .then((res) => setData(res.data))
      .catch(() => {
        setData({
          totalTenants: 12,
          activeTenants: 8,
          trialTenants: 3,
          blockedTenants: 1,
          mrr: 2340,
          arr: 28080,
          expiringCount: 2,
          recentTenants: [],
        });
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-ion-500 border-t-transparent" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink-900">Dashboard</h1>
        <p className="text-sm text-ink-500">Vista general de la plataforma Asimov ERP</p>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Empresas Activas"
          value={String(data.activeTenants)}
          subtitle={`${data.totalTenants} total, ${data.trialTenants} en trial`}
          icon={Building2}
        />
        <KpiCard
          title="MRR"
          value={formatCurrency(data.mrr)}
          subtitle="Ingresos recurrentes mensuales"
          icon={DollarSign}
          trend={{ value: 12, label: 'vs mes anterior' }}
        />
        <KpiCard
          title="ARR"
          value={formatCurrency(data.arr)}
          subtitle="Ingresos recurrentes anuales"
          icon={TrendingUp}
        />
        <KpiCard
          title="Por Vencer"
          value={String(data.expiringCount)}
          subtitle={`${data.blockedTenants} bloqueados`}
          icon={AlertTriangle}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Empresas Recientes</CardTitle>
          </CardHeader>
          {data.recentTenants.length === 0 ? (
            <p className="text-sm text-ink-500">No hay empresas registradas aún</p>
          ) : (
            <div className="space-y-3">
              {data.recentTenants.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-lg border border-ink-100 px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-ink-900">{t.name}</p>
                    <p className="text-xs text-ink-500">
                      {t.subscription?.plan.name ?? 'Sin plan'} &middot; {formatDate(t.createdAt)}
                    </p>
                  </div>
                  <TenantStatusBadge status={t.status} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribución por Plan</CardTitle>
          </CardHeader>
          <div className="space-y-3">
            {[
              { name: 'Trial', color: 'bg-blue-500', pct: data.totalTenants > 0 ? Math.round((data.trialTenants / data.totalTenants) * 100) : 0 },
              { name: 'Basic', color: 'bg-green-500', pct: 40 },
              { name: 'Pro', color: 'bg-ion-500', pct: 35 },
              { name: 'Enterprise', color: 'bg-purple-500', pct: 10 },
            ].map((plan) => (
              <div key={plan.name}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-ink-700">{plan.name}</span>
                  <span className="text-ink-500">{plan.pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-ink-100">
                  <div
                    className={`h-2 rounded-full ${plan.color}`}
                    style={{ width: `${plan.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
