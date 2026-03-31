import { kioskLogger } from '@/utils/kioskLogger';

export interface TestResult {
    name: string;
    passed: boolean;
    message: string;
    data?: any;
}

export const testKioskContent = async (stationId: number | null): Promise<TestResult[]> => {
    const results: TestResult[] = [];

    kioskLogger.info('TEST', `Starting kiosk content test for station: ${stationId}`);

    if (!stationId) {
        results.push({
            name: 'station_id_check',
            passed: false,
            message: 'No station ID provided'
        });
        return results;
    }

    try {
        const { getStationContent, getCars, getTracks, getUniversalCars, getUniversalTracks } = await import('@/api/content');

        results.push({
            name: 'api_import',
            passed: true,
            message: 'API functions imported successfully'
        });

        kioskLogger.info('TEST', 'Testing getStationContent...');
        const stationContent = await getStationContent(stationId);
        
        kioskLogger.debug('TEST', 'Station content response:', stationContent);

        const carsCount = stationContent.cars?.length || 0;
        const tracksCount = stationContent.tracks?.length || 0;

        results.push({
            name: 'station_content_response',
            passed: stationContent !== null && stationContent !== undefined,
            message: `Station content retrieved: ${carsCount} cars, ${tracksCount} tracks`,
            data: { carsCount, tracksCount }
        });

        if (carsCount === 0) {
            kioskLogger.warn('TEST', 'No cars found in station content - checking cache');
            results.push({
                name: 'station_cars_count',
                passed: false,
                message: 'No cars found in station content',
                data: stationContent
            });
        } else {
            results.push({
                name: 'station_cars_count',
                passed: true,
                message: `Found ${carsCount} cars`,
                data: stationContent.cars.slice(0, 3)
            });
        }

        if (tracksCount === 0) {
            kioskLogger.warn('TEST', 'No tracks found in station content');
            results.push({
                name: 'station_tracks_count',
                passed: false,
                message: 'No tracks found in station content',
                data: stationContent
            });
        } else {
            results.push({
                name: 'station_tracks_count',
                passed: true,
                message: `Found ${tracksCount} tracks`,
                data: stationContent.tracks.slice(0, 3)
            });
        }

        kioskLogger.info('TEST', 'Testing getCars function...');
        const cars = await getCars(stationId);
        results.push({
            name: 'getCars_function',
            passed: Array.isArray(cars),
            message: `getCars returned ${cars.length} cars`,
            data: cars.slice(0, 3)
        });

        kioskLogger.info('TEST', 'Testing getTracks function...');
        const tracks = await getTracks(stationId);
        results.push({
            name: 'getTracks_function',
            passed: Array.isArray(tracks),
            message: `getTracks returned ${tracks.length} tracks`,
            data: tracks.slice(0, 3)
        });

        kioskLogger.info('TEST', 'Testing universal content...');
        const universalCars = await getUniversalCars();
        results.push({
            name: 'universal_cars',
            passed: Array.isArray(universalCars) && universalCars.length > 0,
            message: `Universal cars: ${universalCars.length}`,
            data: universalCars.slice(0, 3)
        });

        const universalTracks = await getUniversalTracks();
        results.push({
            name: 'universal_tracks',
            passed: Array.isArray(universalTracks) && universalTracks.length > 0,
            message: `Universal tracks: ${universalTracks.length}`,
            data: universalTracks.slice(0, 3)
        });

        const apiUrl = (await import('@/config')).API_URL;
        results.push({
            name: 'api_url',
            passed: !!apiUrl,
            message: `API URL: ${apiUrl}`,
            data: apiUrl
        });

        kioskLogger.info('TEST', 'All tests completed', { results });

    } catch (error: any) {
        kioskLogger.error('TEST', 'Test failed with error', error);
        results.push({
            name: 'test_execution',
            passed: false,
            message: `Test failed: ${error.message}`,
            data: error
        });
    }

    return results;
};

export const runKioskDiagnostics = async () => {
    kioskLogger.info('DIAGNOSTICS', '=== Kiosk Diagnostics ===');
    
    kioskLogger.info('DIAGNOSTICS', 'User Agent:', navigator.userAgent);
    kioskLogger.info('DIAGNOSTICS', 'Screen:', { width: window.screen.width, height: window.screen.height });
    kioskLogger.info('DIAGNOSTICS', 'Viewport:', { width: window.innerWidth, height: window.innerHeight });
    
    if (navigator.storage) {
        const estimate = await navigator.storage.estimate();
        kioskLogger.info('DIAGNOSTICS', 'Storage:', estimate);
    }
    
    const logs = kioskLogger.getLogs();
    kioskLogger.info('DIAGNOSTICS', 'Current logs count:', logs.length);
    
    return logs;
};