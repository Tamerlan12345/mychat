import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, className = '', ...props }) => {
  return (
    <div className="w-full">
      {label && <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>}
      <input
        className={`w-full bg-slate-900 border border-slate-700 focus:border-brand-primary text-slate-100 rounded-lg px-3.5 py-2.5 text-sm placeholder-slate-500 focus:outline-none transition-colors ${
          error ? 'border-rose-500' : ''
        } ${className}`}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-rose-400">{error}</p>}
    </div>
  );
};
