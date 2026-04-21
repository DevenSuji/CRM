import { ReactNode } from 'react';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'golden';

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: 'bg-mn-border/40 text-mn-text',
  success: 'bg-mn-success/20 text-mn-success',
  warning: 'bg-mn-warning/20 text-mn-warning',
  danger: 'bg-mn-danger/20 text-mn-danger',
  info: 'bg-mn-h1/20 text-mn-h1',
  golden: 'bg-mn-h2/20 text-mn-h2',
};

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${VARIANT_CLASSES[variant]} ${className}`}>
      {children}
    </span>
  );
}
