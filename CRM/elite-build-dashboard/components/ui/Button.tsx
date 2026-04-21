import { ReactNode, ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-mn-h2 text-white hover:bg-mn-h2/90 shadow-lg shadow-mn-h2/20',
  secondary: 'bg-mn-card border border-mn-border text-mn-text hover:bg-mn-card-hover',
  danger: 'bg-mn-danger/20 text-mn-danger border border-mn-danger/30 hover:bg-mn-danger/30',
  ghost: 'text-mn-text-muted hover:text-mn-text hover:bg-mn-card',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
  icon?: ReactNode;
}

export function Button({ variant = 'primary', children, icon, className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
