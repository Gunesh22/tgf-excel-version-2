import React, { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * V2 Light SaaS Standard Select Component
 */
export const Select = forwardRef(({
  label,
  error,
  options = [],
  children,
  className = '',
  containerClassName = '',
  ...props
}, ref) => {
  return (
    <div className={`space-y-1.5 ${containerClassName}`}>
      {label && (
        <label className="block text-xs font-semibold text-slate-700 tracking-wide">
          {label}
        </label>
      )}
      <div className="relative rounded-lg shadow-xs">
        <select
          ref={ref}
          className={`w-full bg-white border text-slate-900 text-sm rounded-lg pr-8 pl-3 py-2 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all cursor-pointer ${
            error ? 'border-rose-400 focus:ring-rose-500' : 'border-slate-300'
          } ${className}`}
          {...props}
        >
          {children ? children : options.map((opt, idx) => (
            <option key={opt.value ?? idx} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-slate-400">
          <ChevronDown className="w-4 h-4" />
        </div>
      </div>
      {error && <p className="text-xs text-rose-600 font-medium mt-1">{error}</p>}
    </div>
  );
});

Select.displayName = 'Select';

export default Select;
