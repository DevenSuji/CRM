import { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className = '', ...props }: InputProps) {
  return (
    <div>
      {label && (
        <label className="block text-[10px] font-black text-mn-h3 uppercase tracking-wider mb-1.5">
          {label}
          {props.required && <span className="text-mn-danger ml-0.5">*</span>}
        </label>
      )}
      <input
        className={`w-full px-4 py-2.5 bg-mn-input-bg border border-mn-input-border rounded-xl text-sm text-mn-text placeholder:text-mn-text-muted/50 focus:outline-none focus:border-mn-input-focus focus:ring-1 focus:ring-mn-input-focus/30 transition-colors ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-mn-danger mt-1">{error}</p>}
    </div>
  );
}
