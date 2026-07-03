'use client';

import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PLAN_LIMITS, MOROSIDAD_TIMELINE } from '@asimov/shared';

export default function SettingsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink-900">Configuración</h1>
        <p className="text-sm text-ink-500">Ajustes globales de la plataforma</p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Planes y Límites</CardTitle>
            <CardDescription>Configuración de los planes disponibles</CardDescription>
          </CardHeader>
          <div className="overflow-hidden rounded-lg border border-ink-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-ink-50">
                  <th className="px-4 py-2 text-left font-medium text-ink-600">Plan</th>
                  <th className="px-4 py-2 text-left font-medium text-ink-600">Usuarios</th>
                  <th className="px-4 py-2 text-left font-medium text-ink-600">Sucursales</th>
                  <th className="px-4 py-2 text-left font-medium text-ink-600">Docs/mes</th>
                  <th className="px-4 py-2 text-left font-medium text-ink-600">Disp. móviles</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(PLAN_LIMITS).map(([tier, limits]) => (
                  <tr key={tier} className="border-t border-ink-100">
                    <td className="px-4 py-2 font-medium text-ink-900 capitalize">{tier}</td>
                    <td className="px-4 py-2 text-ink-700">
                      {limits.maxUsers === Infinity ? '∞' : limits.maxUsers}
                    </td>
                    <td className="px-4 py-2 text-ink-700">
                      {limits.maxBranches === Infinity ? '∞' : limits.maxBranches}
                    </td>
                    <td className="px-4 py-2 text-ink-700">
                      {limits.maxDocsPerMonth === Infinity ? '∞' : limits.maxDocsPerMonth}
                    </td>
                    <td className="px-4 py-2 text-ink-700">
                      {limits.maxMobileDevices === Infinity ? '∞' : limits.maxMobileDevices}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ciclo de Morosidad</CardTitle>
            <CardDescription>Días relativos al vencimiento del pago</CardDescription>
          </CardHeader>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Input
              label="Avisos (días)"
              value={MOROSIDAD_TIMELINE.warningDays.join(', ')}
              readOnly
            />
            <Input
              label="Grace period (días)"
              value={String(MOROSIDAD_TIMELINE.gracePeriodDays)}
              readOnly
            />
            <Input
              label="Read-only (días)"
              value={String(MOROSIDAD_TIMELINE.readOnlyAfterDays)}
              readOnly
            />
            <Input
              label="Bloqueo (días)"
              value={String(MOROSIDAD_TIMELINE.blockedAfterDays)}
              readOnly
            />
            <Input
              label="Eliminación (días)"
              value={String(MOROSIDAD_TIMELINE.deleteAfterDays)}
              readOnly
            />
          </div>
          <p className="mt-3 text-xs text-ink-500">
            Los valores de morosidad se configuran en @asimov/shared constants
          </p>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notificaciones</CardTitle>
            <CardDescription>Configuración de alertas por email</CardDescription>
          </CardHeader>
          <div className="space-y-3">
            {[
              'Nuevo tenant registrado',
              'Pago recibido',
              'Pago fallido',
              'Tenant bloqueado por morosidad',
              'Trial por vencer (48h)',
            ].map((item) => (
              <label key={item} className="flex items-center gap-3">
                <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-ink-300 text-ion-500 focus:ring-ion-500" />
                <span className="text-sm text-ink-700">{item}</span>
              </label>
            ))}
          </div>
          <div className="mt-4">
            <Button size="sm">Guardar preferencias</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
