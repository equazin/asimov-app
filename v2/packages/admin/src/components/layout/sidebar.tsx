'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  ScrollText,
  Settings,
  LogOut,
  Shield,
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Empresas', href: '/dashboard/tenants', icon: Building2 },
  { name: 'Suscripciones', href: '/dashboard/subscriptions', icon: CreditCard },
  { name: 'Auditoría', href: '/dashboard/audit', icon: ScrollText },
  { name: 'Configuración', href: '/dashboard/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const logout = useAuthStore((s) => s.logout);

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-ink-200 bg-white">
      <div className="flex items-center gap-3 border-b border-ink-200 px-6 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ion-500">
          <Shield className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-ink-900">Asimov ERP</h1>
          <p className="text-xs text-ink-500">Panel Maestro</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-ion-50 text-ion-600'
                  : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-ink-200 px-3 py-4">
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-600 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <LogOut className="h-5 w-5" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
