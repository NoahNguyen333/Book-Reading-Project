import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-medium rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none cursor-pointer';
    
    const variantStyles: Record<NonNullable<ButtonProps['variant']>, string> = {
      primary: 'bg-[#C25E38] text-white hover:bg-[#AF512E] focus:ring-[#C25E38]/30 shadow-xs',
      secondary: 'bg-[#EFECE4] text-[#23211E] hover:bg-[#E5E1D6] focus:ring-[#5B7065]/30 dark:bg-[#2A2925] dark:text-[#EDE9E1] dark:hover:bg-[#34332E]',
      outline: 'border border-[#E6E1D6] text-[#23211E] hover:bg-[#F2EFE9] focus:ring-[#C25E38]/20 dark:border-[#2E2D28] dark:text-[#EDE9E1] dark:hover:bg-[#252420]',
      ghost: 'text-[#706B63] hover:text-[#23211E] hover:bg-[#EFECE4] dark:text-[#999388] dark:hover:text-[#EDE9E1] dark:hover:bg-[#252420]',
      danger: 'bg-red-700 text-white hover:bg-red-800 focus:ring-red-500',
    };

    const sizeStyles: Record<NonNullable<ButtonProps['size']>, string> = {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-4 py-2 text-sm',
      lg: 'px-5 py-2.5 text-base',
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
