import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { API_URL } from "../config";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export const resolveAssetUrl = (url?: string | null) => {
    if (!url) return null;
    if (/^(https?:|data:|blob:)/i.test(url)) return url;
    if (url.startsWith('/')) return `${API_URL}${url}`;
    return `${API_URL}/${url}`;
};
