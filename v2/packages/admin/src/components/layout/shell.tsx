'use client';

import { Sidebar } from './sidebar';

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-ink-50 p-8">{children}</main>
    </div>
  );
}
