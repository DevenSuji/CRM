import { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className = '', ...props }: InputProps) {
  return (
    <div>
      {label && (
        <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.18em] text-mn-text-muted">
          {label}
          {props.required && <span className="text-mn-danger ml-0.5">*</span>}
        </label>
      )}
      <input
        className={`min-h-11 w-full rounded-2xl border border-mn-input-border bg-mn-input-bg px-4 py-2.5 text-sm font-medium text-mn-text shadow-sm transition-all placeholder:text-mn-text-muted/50 focus:border-mn-input-focus focus:outline-none focus:ring-4 focus:ring-mn-ring ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-mn-danger mt-1">{error}</p>}
    </div>
  );
}
