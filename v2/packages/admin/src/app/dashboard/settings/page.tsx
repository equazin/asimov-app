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
                  <th className="px-4 py-2 text-left font-medium text-ink-600">Docs/mes</th>
                  <th className="px-4 py-2 text-left font-medium text-ink-600">Productos</th>
                  <th className="px-4 py-2 text-left font-medium text-ink-600">Storage (MB)</th>
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
                      {limits.maxDocsPerMonth === Infinity ? '∞' : limits.maxDocsPerMonth}
                    </td>
                    <td className="px-4 py-2 text-ink-700">
                      {limits.maxProducts === Infinity ? '∞' : limits.maxProducts}
                    </td>
                    <td className="px-4 py-2 text-ink-700">{limits.maxStorageMb}</td>
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
              label="Warning (días)"
              value={String(MOROSIDAD_TIMELINE.WARNING_DAYS)}
              readOnly
            />
            <Input
              label="Reminder (días)"
              value={String(MOROSIDAD_TIMELINE.REMINDER_DAYS)}
              readOnly
            />
            <Input
              label="Grace period (días)"
              value={String(MOROSIDAD_TIMELINE.GRACE_PERIOD_DAYS)}
              readOnly
            />
            <Input
              label="Read-only (días)"
              value={String(MOROSIDAD_TIMELINE.READ_ONLY_DAYS)}
              readOnly
            />
            <Input
              label="Bloqueo (días)"
              value={String(MOROSIDAD_TIMELINE.BLOCK_DAYS)}
              readOnly
            />
            <Input
              label="Eliminación (días)"
              value={String(MOROSIDAD_TIMELINE.DELETE_DAYS)}
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
