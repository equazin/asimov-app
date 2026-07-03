'use client';

import { cn } from '@/lib/cn';
import { forwardRef, type SelectHTMLAttributes } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, id, options, ...props }, ref) => (
    <div className="space-y-1">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-ink-700">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={id}
        className={cn(
          'w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm',
          'focus:border-ion-500 focus:outline-none focus:ring-1 focus:ring-ion-500',
          className,
        )}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  ),
);

Select.displayName = 'Select';
