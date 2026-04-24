import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export function Card({ children, className = '', hover = false, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`app-shell-panel rounded-[var(--mn-radius-card)] ${
        hover ? 'hover:-translate-y-0.5 hover:bg-mn-card-hover hover:border-mn-input-focus/40 hover:shadow-[var(--mn-shadow)] transition-all cursor-pointer' : ''
      } ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
