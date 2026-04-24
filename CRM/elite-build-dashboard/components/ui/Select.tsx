import { SelectHTMLAttributes } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export function Select({ label, options, placeholder, className = '', ...props }: SelectProps) {
  return (
    <div>
      {label && (
        <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.18em] text-mn-text-muted">
          {label}
          {props.required && <span className="text-mn-danger ml-0.5">*</span>}
        </label>
      )}
      <select
        className={`min-h-11 w-full rounded-2xl border border-mn-input-border bg-mn-input-bg px-4 py-2.5 text-sm font-medium text-mn-text shadow-sm transition-all focus:border-mn-input-focus focus:outline-none focus:ring-4 focus:ring-mn-ring ${className}`}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
