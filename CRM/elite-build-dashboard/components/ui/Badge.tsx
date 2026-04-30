import { CSSProperties, ReactNode } from 'react';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'golden';

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: 'bg-mn-border/32 text-mn-text',
  success: 'bg-mn-success/16 text-mn-success',
  warning: 'bg-mn-warning/16 text-mn-warning',
  danger: 'bg-mn-danger/16 text-mn-danger',
  info: 'bg-mn-info/16 text-mn-info',
  golden: 'bg-mn-accent/18 text-mn-accent',
};

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
  title?: string;
  style?: CSSProperties;
}

export function Badge({ children, variant = 'default', className = '', title, style }: BadgeProps) {
  return (
    <span title={title} style={style} className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${VARIANT_CLASSES[variant]} ${className}`}>
      {children}
    </span>
  );
}
