import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface CustomSelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

export interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: (CustomSelectOption | string)[];
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  dropdownClassName?: string;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  align?: 'left' | 'right';
  id?: string;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Select an option',
  className = '',
  buttonClassName = '',
  dropdownClassName = '',
  size = 'md',
  disabled = false,
  align = 'left',
  id,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Normalize options to object format
  const normalizedOptions: CustomSelectOption[] = options.map((opt) =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  );

  const selectedOption = normalizedOptions.find((opt) => opt.value === value);

  // Close when clicked outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return;
      if (event.key === 'Escape') {
        event.stopPropagation();
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen]);

  const sizeClasses = {
    sm: 'h-8 px-2.5 text-xs rounded-lg gap-1.5',
    md: 'h-9 px-3 text-xs rounded-xl gap-2',
    lg: 'h-10 px-3.5 text-sm rounded-xl gap-2',
  }[size];

  const itemSizeClasses = {
    sm: 'px-2.5 py-1.5 text-xs rounded-md',
    md: 'px-3 py-2 text-xs rounded-lg',
    lg: 'px-3.5 py-2.5 text-sm rounded-lg',
  }[size];

  return (
    <div
      ref={containerRef}
      className={`relative inline-block text-left select-none ${className}`}
      id={id}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`flex items-center justify-between bg-white border transition-all cursor-pointer font-medium ${
          isOpen
            ? 'border-primary-500 ring-2 ring-primary-500/20 shadow-xs'
            : 'border-surface-200 hover:border-surface-300 shadow-2xs hover:bg-surface-50/50'
        } ${sizeClasses} ${
          disabled ? 'opacity-50 cursor-not-allowed bg-surface-50' : ''
        } ${buttonClassName}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-2 truncate">
          {selectedOption?.icon}
          <span
            className={`truncate ${
              selectedOption ? 'text-surface-800' : 'text-surface-400'
            }`}
          >
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-surface-400 flex-shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-primary-600' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute ${
            align === 'right' ? 'right-0' : 'left-0'
          } top-full mt-1.5 z-50 min-w-full w-max max-w-xs max-h-60 overflow-y-auto bg-white rounded-xl shadow-xl border border-surface-200/90 p-1.5 space-y-0.5 animate-in fade-in-0 zoom-in-95 duration-100 ${dropdownClassName}`}
          role="listbox"
        >
          {normalizedOptions.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between text-left transition-colors cursor-pointer ${itemSizeClasses} ${
                  isSelected
                    ? 'bg-primary-50 font-semibold text-primary-700'
                    : 'text-surface-700 hover:bg-surface-100/80 hover:text-surface-900 font-medium'
                }`}
                role="option"
                aria-selected={isSelected}
              >
                <span className="flex items-center gap-2 truncate pr-2">
                  {option.icon}
                  <span className="truncate">{option.label}</span>
                </span>
                {isSelected && (
                  <Check className="w-3.5 h-3.5 text-primary-600 flex-shrink-0 ml-2" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
