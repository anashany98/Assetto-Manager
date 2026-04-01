/**
 * Custom hook for station list filtering (ghost stations, inactive, etc.)
 * Extracted from SettingsPage.tsx to reduce component complexity.
 */
import { useMemo, useState } from 'react';
import { type Station } from '../../../api/stations';

export function useStationFilters(stations: Station[] | undefined, healthById: Map<number, any>) {
    const [showInactiveStations, setShowInactiveStations] = useState(false);
    const [showGhostStations, setShowGhostStations] = useState(false);
    const [ghostThresholdHours, setGhostThresholdHours] = useState(24);

    const isStationOnline = (station: Station) => {
        const health = healthById.get(station.id);
        if (health && typeof health.is_online === 'boolean') {
            return health.is_online;
        }
        return station.is_online;
    };

    const ghostCutoff = useMemo(
        () => Date.now() - ghostThresholdHours * 60 * 60 * 1000,
        [ghostThresholdHours]
    );

    const isGhostStation = (station: Station) => {
        if (station.is_active === false || station.status === 'archived') {
            return false;
        }
        if (isStationOnline(station)) return false;
        if (!station.last_seen) return true;
        const seenAt = new Date(station.last_seen).getTime();
        if (!Number.isFinite(seenAt)) return true;
        return seenAt < ghostCutoff;
    };

    const visibleStations = Array.isArray(stations)
        ? stations.filter((station) => showInactiveStations ? true : station.is_active !== false)
        : [];

    const ghostStations = visibleStations.filter((station) => isGhostStation(station));
    const filteredStations = showGhostStations
        ? visibleStations
        : visibleStations.filter((station) => !isGhostStation(station));

    return {
        showInactiveStations,
        setShowInactiveStations,
        showGhostStations,
        setShowGhostStations,
        ghostThresholdHours,
        setGhostThresholdHours,
        ghostCutoff,
        isStationOnline,
        isGhostStation,
        visibleStations,
        ghostStations,
        filteredStations,
    };
}
