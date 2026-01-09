import axios from 'axios';

const API_URL = 'http://localhost:8000';

export interface Mod {
    id: number;
    name: string;
    version: string;
    type: string;
    status: string;
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

export const getMods = async (): Promise<Mod[]> => {
    const response = await axios.get(`${API_URL}/mods`);
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
