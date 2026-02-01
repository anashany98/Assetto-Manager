import axios from 'axios';
import { API_URL } from '../config';

export interface WallpaperFile {
    filename: string;
    url: string;
    size: number;
}

export interface WallpaperConfig {
    interval_seconds: number;
    active_wallpapers: string[]; // filenames
}

export const getWallpapers = async (): Promise<WallpaperFile[]> => {
    const res = await axios.get(`${API_URL}/wallpapers/files`);
    return res.data;
};

export const uploadWallpaper = async (file: File): Promise<void> => {
    const formData = new FormData();
    formData.append('file', file);
    await axios.post(`${API_URL}/wallpapers/files`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
};

export const deleteWallpaper = async (filename: string): Promise<void> => {
    await axios.delete(`${API_URL}/wallpapers/files/${filename}`);
};

export const getWallpaperConfig = async (): Promise<WallpaperConfig> => {
    const res = await axios.get(`${API_URL}/wallpapers/config`);
    return res.data;
};

export const updateWallpaperConfig = async (config: WallpaperConfig): Promise<void> => {
    await axios.post(`${API_URL}/wallpapers/config`, config);
};
