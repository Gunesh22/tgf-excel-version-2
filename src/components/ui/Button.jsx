import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * V2 Light SaaS Standard Button Component with Micro-Interactions
 * Variants: primary, secondary, outline, danger, ghost, success, admin
 * Sizes: sm, md, lg
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  disabled = false,
  isLoading = false,
  loadingText,
  type = 'button',
  icon: Icon,
  onClick,
  ...props
}) {
  const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 ease-out focus:outline-none focus:ring-2 focus:ring-offset-1 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 select-none cursor-pointer';

  const sizeStyles = {
    sm: 'text-xs px-2.5 py-1 gap-1.5 h-8',
    md: 'text-xs px-3 py-1.5 gap-2 h-9 font-semibold',
    lg: 'text-sm px-4 py-2 gap-2 h-10 font-semibold',
  };

  const variantStyles = {
    primary: 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-2xs focus:ring-indigo-500/20 border border-transparent',
    admin: 'bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white shadow-2xs focus:ring-slate-400 border border-transparent',
    secondary: 'bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 focus:ring-slate-400 border border-slate-200',
    outline: 'bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 border border-slate-300 shadow-2xs focus:ring-slate-400',
    danger: 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-2xs focus:ring-rose-500 border border-transparent',
    success: 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-2xs focus:ring-emerald-500 border border-transparent',
    ghost: 'bg-transparent hover:bg-slate-100 active:bg-slate-200 text-slate-600 hover:text-slate-900 focus:ring-slate-400',
  };

  const isBtnDisabled = disabled || isLoading;

  return (
    <button
      type={type}
      disabled={isBtnDisabled}
      onClick={onClick}
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <Loader2 className={`animate-spin ${size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} />
      ) : (
        Icon && <Icon className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
      )}
      {isLoading && loadingText ? loadingText : children}
    </button>
  );
}

export default Button;
