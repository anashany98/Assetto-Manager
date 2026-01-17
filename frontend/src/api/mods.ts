import axios from 'axios';
import { API_URL } from '../config';

export interface Mod {
    id: number;
    name: string;
    version: string;
    type: string;
    status: string;
    is_active: boolean;
    size_bytes: number;
    tags: Tag[];
    created_at: string;
}

export interface ModMetadata {
    name?: string;
    description?: string;
    specs?: Record<string, string>; // For cars (bhp, torque, etc)
    image_url?: string;
    map_url?: string; // For tracks
    outline_url?: string; // For tracks
    brand?: string;
    class?: string;
    city?: string;
    length?: string;
}

export const getMods = async (filters?: { search?: string; type?: string; tag?: string }): Promise<Mod[]> => {
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);
    if (filters?.type && filters.type !== 'all') params.append('type', filters.type);
    if (filters?.tag) params.append('tag', filters.tag);

    const response = await axios.get(`${API_URL}/mods?${params.toString()}`);
    return response.data;
};

export const getModMetadata = async (modId: number): Promise<ModMetadata> => {
    const response = await axios.get(`${API_URL}/mods/${modId}/metadata`);
    return response.data;
};

export const uploadMod = async (file: File, metadata: { name: string; type: string; version: string }) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', metadata.name);
    formData.append('type', metadata.type);
    formData.append('version', metadata.version);

    const response = await axios.post(`${API_URL}/mods/upload`, formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
    return response.data;
};

export const deleteMod = async (modId: number): Promise<void> => {
    await axios.delete(`${API_URL}/mods/${modId}`);
};

export const bulkDeleteMods = async (modIds: number[]): Promise<{ deleted: number }> => {
    const response = await axios.post(`${API_URL}/mods/bulk/delete`, modIds);
    return response.data;
};

export const toggleMod = async (modId: number): Promise<Mod> => {
    const response = await axios.put(`${API_URL}/mods/${modId}/toggle`);
    return response.data;
};

export const bulkToggleMods = async (modIds: number[], state: boolean): Promise<{ updated: number }> => {
    const response = await axios.post(`${API_URL}/mods/bulk/toggle`, modIds, {
        params: { target_state: state }
    });
    return response.data;
};

export const deployToStations = async (): Promise<{ status: string; message?: string }> => {
    const response = await axios.post(`${API_URL}/deploy/push`);
    return response.data;
};

export interface Tag {
    id: number;
    name: string;
    color: string;
}

export const getTags = async (): Promise<Tag[]> => {
    const response = await axios.get(`${API_URL}/mods/tags`);
    return response.data;
};

export const createTag = async (name: string, color: string): Promise<Tag> => {
    const response = await axios.post(`${API_URL}/mods/tags`, { name, color });
    return response.data;
};

export const addTagToMod = async (modId: number, tagId: number): Promise<Mod> => {
    const response = await axios.post(`${API_URL}/mods/${modId}/tags/${tagId}`);
    return response.data;
};

export const removeTagFromMod = async (modId: number, tagId: number): Promise<Mod> => {
    const response = await axios.delete(`${API_URL}/mods/${modId}/tags/${tagId}`);
    return response.data;
};

export const getDiskUsage = async (): Promise<{ total_size_bytes: number; pretty: string }> => {
    const response = await axios.get(`${API_URL}/mods/disk_usage`);
    return response.data;
};
