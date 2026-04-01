import { useEffect, useRef } from 'react';

interface ShortcutConfig {
    key: string;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    action: () => void;
    description?: string;
}

export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
    const shortcutsRef = useRef(shortcuts);

    useEffect(() => {
        shortcutsRef.current = shortcuts;
    });

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const isInput = target?.tagName === 'INPUT' ||
                target?.tagName === 'TEXTAREA' ||
                target?.getAttribute('contenteditable') === 'true';

            if (isInput) return;

            for (const shortcut of shortcutsRef.current) {
                const matchesKey = e.key.toLowerCase() === shortcut.key.toLowerCase();
                const matchesCtrl = shortcut.ctrlKey ? e.ctrlKey || e.metaKey : !(e.ctrlKey || e.metaKey);
                const matchesShift = shortcut.shiftKey ? e.shiftKey : !e.shiftKey;
                const matchesAlt = shortcut.altKey ? e.altKey : !e.altKey;

                if (matchesKey && matchesCtrl && matchesShift && matchesAlt) {
                    e.preventDefault();
                    shortcut.action();
                    return;
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);
}

export function getShortcutLabel(shortcut: ShortcutConfig): string {
    const parts: string[] = [];
    if (shortcut.ctrlKey) parts.push('Ctrl');
    if (shortcut.shiftKey) parts.push('Shift');
    if (shortcut.altKey) parts.push('Alt');
    parts.push(shortcut.key.toUpperCase());
    return parts.join('+');
}
