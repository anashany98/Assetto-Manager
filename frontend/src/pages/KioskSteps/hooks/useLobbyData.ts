/**
 * Custom hook for lobby data fetching and filtering
 * Extracted from KioskSteps.tsx to reduce component complexity.
 */
import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { API_URL } from '../../../config';

export function useLobbyData() {
    const { data: lobbies = [] } = useQuery({
        queryKey: ['lobbies'],
        queryFn: () => axios.get(`${API_URL}/lobby/list?status=active`).then(r => r.data),
        refetchInterval: 5000
    });

    const displayLobbies = Array.isArray(lobbies) ? lobbies : [];
    const LOBBIES_PER_PAGE = 4;
    const lobbyPages = Math.max(1, Math.ceil(displayLobbies.length / LOBBIES_PER_PAGE));
    const [lobbyPage, setLobbyPage] = useState(0);

    useEffect(() => {
        setLobbyPage((prev) => Math.min(prev, lobbyPages - 1));
    }, [lobbyPages]);

    const lobbyStart = lobbyPage * LOBBIES_PER_PAGE;
    const visibleLobbies = displayLobbies.slice(lobbyStart, lobbyStart + LOBBIES_PER_PAGE);

    return {
        displayLobbies,
        visibleLobbies,
        lobbyPage,
        lobbyPages,
        setLobbyPage,
        LOBBIES_PER_PAGE,
    };
}

export function useScenarioPagination(scenarios: any[]) {
    const SCENARIOS_PER_PAGE = 4;
    const scenarioPages = Math.max(1, Math.ceil(scenarios.length / SCENARIOS_PER_PAGE));
    const [scenarioPage, setScenarioPage] = useState(0);

    useEffect(() => {
        setScenarioPage((prev) => Math.min(prev, scenarioPages - 1));
    }, [scenarioPages]);

    const scenarioStart = scenarioPage * SCENARIOS_PER_PAGE;
    const quickScenarios = scenarios.slice(scenarioStart, scenarioStart + SCENARIOS_PER_PAGE);

    return {
        quickScenarios,
        scenarioPage,
        scenarioPages,
        setScenarioPage,
        SCENARIOS_PER_PAGE,
    };
}
