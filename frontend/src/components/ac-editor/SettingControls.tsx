import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../lib/utils';

export function SettingSlider({
    label,
    value,
    min = 0,
    max = 100,
    step = 1,
    unit = '%',
    color = 'blue',
    onChange
}: {
    label: string;
    value: number;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    color?: string;
    onChange: (v: number) => void;
}) {
    const colorClasses: Record<string, string> = {
        blue: 'accent-blue-500',
        orange: 'accent-orange-500',
        purple: 'accent-purple-500',
        green: 'accent-green-500',
        red: 'accent-red-500',
        cyan: 'accent-cyan-500',
        yellow: 'accent-yellow-500',
    };

    const textColorClasses: Record<string, string> = {
        blue: 'text-blue-400',
        orange: 'text-orange-400',
        purple: 'text-purple-400',
        green: 'text-green-400',
        red: 'text-red-400',
        cyan: 'text-cyan-400',
        yellow: 'text-yellow-400',
    };

    return (
        <div className="space-y-2">
            <div className="flex justify-between items-center">
                <label className="text-sm font-bold text-[var(--text-secondary)]">{label}</label>
                <span className={cn("text-sm font-bold", textColorClasses[color] || 'text-blue-400')}>
                    {value}{unit}
                </span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className={cn("w-full h-2 bg-gray-700 rounded-lg cursor-pointer", colorClasses[color])}
            />
        </div>
    );
}

export function SettingToggle({
    label,
    value,
    description,
    onChange
}: {
    label: string;
    value: boolean;
    description?: string;
    onChange: (v: boolean) => void;
}) {
    return (
        <div className="flex items-center justify-between p-4 bg-[var(--bg-elevated)]/50 rounded-xl border border-[var(--border-default)]">
            <div>
                <p className="font-bold text-[var(--text-primary)]">{label}</p>
                {description && <p className="text-xs text-[var(--text-tertiary)] mt-1">{description}</p>}
            </div>
            <button
                onClick={() => onChange(!value)}
                className={cn(
                    "w-14 h-7 rounded-full transition-all relative",
                    value ? "bg-green-500" : "bg-gray-600"
                )}
            >
                <div className={cn(
                    "absolute top-1 left-1 w-5 h-5 rounded-full bg-[var(--bg-card)] shadow-lg transition-transform",
                    value && "translate-x-7"
                )} />
            </button>
        </div>
    );
}

export function SettingSelect({
    label,
    value,
    options,
    onChange
}: {
    label: string;
    value: string;
    options: { value: string; label: string }[];
    onChange: (v: string) => void;
}) {
    return (
        <div className="space-y-2">
            <label className="text-sm font-bold text-[var(--text-secondary)]">{label}</label>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-strong)] text-[var(--text-primary)] font-medium focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            >
                {options.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
            </select>
        </div>
    );
}

export function SettingSection({
    title,
    icon: Icon,
    color = 'blue',
    children,
    defaultOpen = true
}: {
    title: string;
    icon: React.ComponentType<{ className?: string; size?: number }>;
    color?: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
}) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    const iconColorClasses: Record<string, string> = {
        blue: 'text-blue-400',
        orange: 'text-orange-400',
        purple: 'text-purple-400',
        green: 'text-green-400',
        red: 'text-red-400',
        cyan: 'text-cyan-400',
        yellow: 'text-yellow-400',
    };

    return (
        <div className="glass-card overflow-hidden">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "w-full flex items-center justify-between p-4 transition-colors",
                    isOpen ? "bg-[var(--bg-card)]/5" : "hover:bg-[var(--bg-card)]/5"
                )}
            >
                <div className="flex items-center gap-3">
                    <Icon size={20} className={iconColorClasses[color] || 'text-blue-400'} />
                    <span className="font-bold text-[var(--text-primary)]">{title}</span>
                </div>
                {isOpen ? <ChevronUp size={18} className="text-[var(--text-tertiary)]" /> : <ChevronDown size={18} className="text-[var(--text-tertiary)]" />}
            </button>
            {isOpen && (
                <div className="p-4 pt-0 space-y-4 animate-fade-in">
                    {children}
                </div>
            )}
        </div>
    );
}
