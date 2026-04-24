import { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, actions, className = '' }: PageHeaderProps) {
  return (
    <header className={`mx-3 mt-3 flex flex-col gap-4 rounded-[1.75rem] px-5 py-5 sm:mx-4 sm:mt-4 sm:px-6 md:flex-row md:items-end md:justify-between md:px-8 ${className} app-shell-panel`}>
      <div className="min-w-0">
        <p className="mb-2 text-[10px] font-black uppercase tracking-[0.34em] text-mn-accent">Elite Build CRM</p>
        <h1 className="truncate text-[2rem] font-black leading-none tracking-[-0.04em] text-mn-h1 sm:text-[2.45rem]">{title}</h1>
        {subtitle && <p className="mt-2 text-sm font-medium text-mn-text-muted">{subtitle}</p>}
      </div>
      {actions && (
        <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-wrap md:justify-end md:overflow-visible md:pb-0">
          {actions}
        </div>
      )}
    </header>
  );
}
