'use client';

import { useEffect, useState } from 'react';
import { CreditCard, AlertCircle, Clock, CheckCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/lib/auth-store';
import { apiGet } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import { MOROSIDAD_TIMELINE } from '@asimov/shared';

interface SubscriptionRow {
  id: string;
  status: string;
  currentPeriodEnd: string;
  tenant: { id: string; name: string; status: string };
  plan: { name: string; price: number };
}

export default function SubscriptionsPage() {
  const token = useAuthStore((s) => s.accessToken);
  const [subs, setSubs] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    apiGet<{ success: boolean; data: SubscriptionRow[] }>('/master/tenants?include=subscription', token)
      .then((res) => setSubs(res.data as unknown as SubscriptionRow[]))
      .catch(() => setSubs([]))
      .finally(() => setLoading(false));
  }, [token]);

  const statusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'past_due': return <AlertCircle className="h-4 w-4 text-amber-600" />;
      case 'grace_period': return <Clock className="h-4 w-4 text-amber-600" />;
      default: return <CreditCard className="h-4 w-4 text-ink-400" />;
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink-900">Suscripciones</h1>
        <p className="text-sm text-ink-500">
          Control de pagos y ciclo de morosidad
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Ciclo de Morosidad</CardTitle>
        </CardHeader>
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {[
            { label: `Aviso -${Math.abs(MOROSIDAD_TIMELINE.warningDays[0])}d`, color: 'bg-yellow-100 text-yellow-800' },
            { label: `Aviso -${Math.abs(MOROSIDAD_TIMELINE.warningDays[MOROSIDAD_TIMELINE.warningDays.length - 1])}d`, color: 'bg-amber-100 text-amber-800' },
            { label: 'Cobro Día 0', color: 'bg-blue-100 text-blue-800' },
            { label: `Grace +${MOROSIDAD_TIMELINE.gracePeriodDays}d`, color: 'bg-orange-100 text-orange-800' },
            { label: `Read-Only +${MOROSIDAD_TIMELINE.readOnlyAfterDays}d`, color: 'bg-red-100 text-red-800' },
            { label: `Block +${MOROSIDAD_TIMELINE.blockedAfterDays}d`, color: 'bg-red-200 text-red-900' },
            { label: `Delete +${MOROSIDAD_TIMELINE.deleteAfterDays}d`, color: 'bg-ink-800 text-white' },
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-2">
              {i > 0 && <div className="h-0.5 w-6 bg-ink-200" />}
              <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${step.color}`}>
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <div className="overflow-hidden rounded-xl border border-ink-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50">
              <th className="px-6 py-3 text-left font-medium text-ink-600">Empresa</th>
              <th className="px-6 py-3 text-left font-medium text-ink-600">Plan</th>
              <th className="px-6 py-3 text-left font-medium text-ink-600">Precio</th>
              <th className="px-6 py-3 text-left font-medium text-ink-600">Estado</th>
              <th className="px-6 py-3 text-left font-medium text-ink-600">Vencimiento</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center">
                  <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-ion-500 border-t-transparent" />
                </td>
              </tr>
            ) : subs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-ink-500">
                  No hay suscripciones
                </td>
              </tr>
            ) : (
              subs.map((s) => (
                <tr key={s.id} className="border-b border-ink-100 hover:bg-ink-50">
                  <td className="px-6 py-4 font-medium text-ink-900">{s.tenant.name}</td>
                  <td className="px-6 py-4 text-ink-700">{s.plan.name}</td>
                  <td className="px-6 py-4 text-ink-700">{formatCurrency(s.plan.price)}/mes</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {statusIcon(s.status)}
                      <Badge variant={s.status === 'active' ? 'success' : 'warning'}>
                        {s.status}
                      </Badge>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-ink-700">{formatDate(s.currentPeriodEnd)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
