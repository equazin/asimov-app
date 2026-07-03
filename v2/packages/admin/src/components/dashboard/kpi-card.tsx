import { cn } from '@/lib/cn';
import type { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: number; label: string };
  className?: string;
}

export function KpiCard({ title, value, subtitle, icon: Icon, trend, className }: KpiCardProps) {
  return (
    <div className={cn('rounded-xl border border-ink-200 bg-white p-6 shadow-sm', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-ink-500">{title}</p>
          <p className="mt-1 text-3xl font-bold text-ink-900">{value}</p>
          {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
          {trend && (
            <p
              className={cn(
                'mt-2 text-sm font-medium',
                trend.value >= 0 ? 'text-green-600' : 'text-red-600',
              )}
            >
              {trend.value >= 0 ? '+' : ''}{trend.value}% {trend.label}
            </p>
          )}
        </div>
        <div className="rounded-lg bg-ion-50 p-3">
          <Icon className="h-6 w-6 text-ion-500" />
        </div>
      </div>
    </div>
  );
}
