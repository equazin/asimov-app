export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency }).format(amount);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('es-AR').format(n);
}
