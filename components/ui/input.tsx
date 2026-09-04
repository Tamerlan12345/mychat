import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, className = '', ...props }) => {
  return (
    <div className="w-full">
       {label && <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>}
      <input
         className={`w-full bg-white border border-slate-200 focus:border-blue-500 text-slate-900 rounded-md px-3.5 py-2.5 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors ${
          error ? 'border-rose-500' : ''
        } ${className}`}
        {...props}
      />
       {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
};
