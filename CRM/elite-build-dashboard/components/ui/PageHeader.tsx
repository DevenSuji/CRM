import { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, actions, className = '' }: PageHeaderProps) {
  return (
    <header className={`flex items-center justify-between px-8 py-5 border-b border-mn-border bg-mn-card/50 ${className}`}>
      <div>
        <h1 className="text-2xl font-black text-mn-h1">{title}</h1>
        {subtitle && <p className="text-sm text-mn-text-muted mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </header>
  );
}
