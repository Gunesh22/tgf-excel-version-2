import React from 'react';

/**
 * V2 Light SaaS Card Component
 */
export function Card({
  children,
  className = '',
  header,
  footer,
  noPadding = false,
  ...props
}) {
  return (
    <div
      className={`bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden ${className}`}
      {...props}
    >
      {header && (
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          {typeof header === 'string' ? (
            <h3 className="text-sm font-semibold text-slate-800">{header}</h3>
          ) : (
            header
          )}
        </div>
      )}
      <div className={noPadding ? '' : 'p-4'}>{children}</div>
      {footer && (
        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50">
          {footer}
        </div>
      )}
    </div>
  );
}

export default Card;
