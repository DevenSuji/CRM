import { ReactNode, ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'border border-transparent bg-mn-brand text-mn-brand-contrast hover:bg-mn-brand/90 shadow-[0_10px_30px_color-mix(in_srgb,var(--mn-text)_22%,transparent)] disabled:border-mn-border/70 disabled:bg-mn-card/80 disabled:text-mn-text-muted disabled:shadow-none',
  secondary: 'bg-mn-card/80 border border-mn-border/70 text-mn-text hover:bg-mn-card-hover hover:border-mn-input-focus/40 shadow-sm',
  danger: 'bg-mn-danger/12 text-mn-danger border border-mn-danger/20 hover:bg-mn-danger/18',
  ghost: 'text-mn-text-muted hover:text-mn-text hover:bg-mn-card/60',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
  icon?: ReactNode;
}

export function Button({ variant = 'primary', children, icon, className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-black tracking-tight transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:hover:translate-y-0 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
