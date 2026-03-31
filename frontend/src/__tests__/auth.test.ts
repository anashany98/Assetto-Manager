import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { login, logout, getMe, refreshSession } from '../api/auth';

describe('Auth API', () => {
    beforeEach(() => {
        mockFetch.mockReset();
    });

    describe('login', () => {
        it('sends POST to /auth/token with credentials', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ access_token: 'abc123', token_type: 'bearer' }),
            });

            const result = await login('admin', 'password123');

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/auth/token'),
                expect.objectContaining({
                    method: 'POST',
                    credentials: 'include',
                }),
            );
            expect(result.access_token).toBe('abc123');
        });

        it('throws on invalid credentials', async () => {
            mockFetch.mockResolvedValueOnce({ ok: false });

            await expect(login('admin', 'wrong')).rejects.toThrow('Invalid credentials');
        });
    });

    describe('logout', () => {
        it('sends POST to /auth/logout with credentials', async () => {
            mockFetch.mockResolvedValueOnce({ ok: true });

            await logout();

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/auth/logout'),
                expect.objectContaining({
                    method: 'POST',
                    credentials: 'include',
                }),
            );
        });

        it('does not throw if backend is unreachable', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            await expect(logout()).resolves.toBeUndefined();
        });
    });

    describe('getMe', () => {
        it('sends GET to /auth/users/me with Bearer token when provided', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ username: 'admin', role: 'admin', permissions: [] }),
            });

            const user = await getMe('mytoken');

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/auth/users/me'),
                expect.objectContaining({
                    headers: expect.objectContaining({ Authorization: 'Bearer mytoken' }),
                    credentials: 'include',
                }),
            );
            expect(user.username).toBe('admin');
        });

        it('can fetch /auth/users/me using cookies only', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ username: 'admin', role: 'admin', permissions: [] }),
            });

            await getMe();

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/auth/users/me'),
                expect.objectContaining({
                    credentials: 'include',
                }),
            );
            expect(mockFetch.mock.calls[0]?.[1]?.headers).toBeUndefined();
        });

        it('throws auth error with status on 401', async () => {
            mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

            await expect(getMe('badtoken')).rejects.toMatchObject({ status: 401 });
        });
    });

    describe('refreshSession', () => {
        it('sends POST to /auth/refresh with cookies', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ access_token: 'fresh-token', token_type: 'bearer' }),
            });

            const result = await refreshSession();

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/auth/refresh'),
                expect.objectContaining({
                    method: 'POST',
                    credentials: 'include',
                }),
            );
            expect(result.access_token).toBe('fresh-token');
        });

        it('throws with status when refresh fails', async () => {
            mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

            await expect(refreshSession()).rejects.toMatchObject({ status: 401 });
        });
    });
});
