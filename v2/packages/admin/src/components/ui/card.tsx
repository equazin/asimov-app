import { cn } from '@/lib/cn';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <div className={cn('rounded-xl border border-ink-200 bg-white p-6 shadow-sm', className)}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: CardProps) {
  return <div className={cn('mb-4', className)}>{children}</div>;
}

export function CardTitle({ children, className }: CardProps) {
  return <h3 className={cn('text-lg font-semibold text-ink-900', className)}>{children}</h3>;
}

export function CardDescription({ children, className }: CardProps) {
  return <p className={cn('text-sm text-ink-500', className)}>{children}</p>;
}
