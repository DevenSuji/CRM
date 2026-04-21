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
        <label className="block text-[10px] font-black text-mn-h3 uppercase tracking-wider mb-1.5">
          {label}
          {props.required && <span className="text-mn-danger ml-0.5">*</span>}
        </label>
      )}
      <select
        className={`w-full px-4 py-2.5 bg-mn-input-bg border border-mn-input-border rounded-xl text-sm text-mn-text focus:outline-none focus:border-mn-input-focus focus:ring-1 focus:ring-mn-input-focus/30 transition-colors ${className}`}
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
