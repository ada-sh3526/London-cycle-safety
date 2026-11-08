import { createFileRoute } from '@tanstack/react-router';
import { Layer, Map, Source } from '@vis.gl/react-maplibre';
import { useEffect, useState } from 'react';

import 'maplibre-gl/dist/maplibre-gl.css';

type ScreenData = {
    summary: { cyclistCasualties: number; uniqueCollisions: number; fatal: number; serious: number; slight: number; topBorough: string; topBoroughCount: number; ksiRate2025: number };
    boroughs: Array<{ name: string; casualties: number }>;
    events: Array<{ severity: number; longitude: number | null; latitude: number | null }>;
};

type BoroughBoundaries = {
    type: 'FeatureCollection';
    features: Array<{
        type: 'Feature';
        properties: { name: string; gss_code: string; ons_inner: string; casualties?: number };
        geometry: { type: 'Polygon'; coordinates: number[][][] };
    }>;
};

export const Route = createFileRoute('/screen')({ component: ObservatoryScreen });

function ObservatoryScreen() {
    const [data, setData] = useState<ScreenData | null>(null);
    const [boundaries, setBoundaries] = useState<BoroughBoundaries | null>(null);
    useEffect(() => {
        const controller = new AbortController();
        Promise.all([
            fetch('/data/london-cyclist-safety-2025.json', { signal: controller.signal }),
            fetch('/data/london-boroughs.geojson', { signal: controller.signal })
        ])
            .then(async ([datasetResponse, boundaryResponse]) => {
                if (!datasetResponse.ok || !boundaryResponse.ok) throw new Error('Dataset unavailable');
                const [dataset, boundaryData] = await Promise.all([
                    datasetResponse.json() as Promise<ScreenData>,
                    boundaryResponse.json() as Promise<BoroughBoundaries>
                ]);
                setData(dataset);
                setBoundaries(boundaryData);
            })
            .catch(() => setData(null));
        return () => controller.abort();
    }, []);

    const boroughCounts = new globalThis.Map<string, number>((data?.boroughs ?? []).map((item) => [normaliseBorough(item.name), item.casualties]));
    const boroughGeoJSON = boundaries ? {
        type: 'FeatureCollection' as const,
        features: boundaries.features.map((feature) => ({
            ...feature,
            properties: { ...feature.properties, casualties: boroughCounts.get(normaliseBorough(feature.properties.name)) ?? 0 }
        }))
    } : null;
    const maxBoroughCount = Math.max(1, ...(data?.boroughs.map((item) => item.casualties) ?? []));

    const geojson = {
        type: 'FeatureCollection' as const,
        features: (data?.events ?? []).filter((event) => event.longitude !== null && event.latitude !== null).map((event) => ({
            type: 'Feature' as const,
            properties: { severity: event.severity },
            geometry: { type: 'Point' as const, coordinates: [event.longitude as number, event.latitude as number] }
        }))
    };

    return <main className="observatory-screen">
        <div className="screen-map">
            <Map initialViewState={{ longitude: -0.12, latitude: 51.51, zoom: 9.5, bearing: 0, pitch: 0 }} mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json" interactive={false}>
                {boroughGeoJSON && <Source id="wall-borough-counts" type="geojson" data={boroughGeoJSON}>
                    <Layer id="wall-borough-fill" type="fill" paint={{
                        'fill-color': ['interpolate', ['linear'], ['get', 'casualties'], 0, '#152326', maxBoroughCount * 0.25, '#1d5748', maxBoroughCount * 0.5, '#288868', maxBoroughCount * 0.75, '#49b98e', maxBoroughCount, '#a1e7bc'],
                        'fill-opacity': 0.68
                    }} />
                    <Layer id="wall-borough-lines" type="line" paint={{ 'line-color': '#9bdcc5', 'line-width': 0.7, 'line-opacity': 0.7 }} />
                    <Layer id="wall-borough-labels" type="symbol" layout={{ 'text-field': ['get', 'name'], 'text-size': ['interpolate', ['linear'], ['zoom'], 8, 8, 10, 11], 'text-allow-overlap': false }} paint={{ 'text-color': '#f2faf5', 'text-halo-color': '#081112', 'text-halo-width': 1.5 }} />
                </Source>}
                <Source id="wall-collisions" type="geojson" data={geojson}>
                    <Layer id="wall-casualties" type="circle" paint={{
                        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2.1, 12, 5],
                        'circle-color': ['match', ['get', 'severity'], 1, '#ff625c', 2, '#ffc66d', '#62ddba'],
                        'circle-opacity': 0.58,
                        'circle-blur': 0.12
                    }} />
                </Source>
            </Map>
        </div>
        <div className="screen-vignette" />
        <header className="screen-title"><p>DATA OBSERVATORY · LONDON · 2025</p><h1>How safe is<br />cycling in London?</h1><span>In 2025, TfL's published KSI rate was 2.19 casualties per million cycle journey stages.</span></header>
        <aside className="screen-legend" aria-label="Map legends">
            <div className="screen-count-legend"><strong>Borough casualty records</strong><div><span>0</span><i /><span>{maxBoroughCount.toLocaleString()}</span></div><small>Counts, not risk rates</small></div>
            <div className="screen-severity-legend"><span><i className="fatal-dot" /> Fatal</span><span><i className="serious-dot" /> Serious</span><span><i className="slight-dot" /> Slight</span></div>
        </aside>
        {data && <footer className="screen-stats"><div><strong>{data.summary.cyclistCasualties.toLocaleString()}</strong><span>cyclist casualties in TfL's 2025 extract</span></div><div><strong>{(data.summary.fatal + data.summary.serious).toLocaleString()}</strong><span>killed or seriously injured casualties</span></div><div><strong>{data.summary.ksiRate2025.toFixed(2)}</strong><span>KSI per million cycle journey stages</span></div><p>The KSI journey-stage rate is 17.4% below TfL's 2010–14 baseline, but 6.9% above 2024. Counts show reported injury collisions only.</p></footer>}
        {!data && <p className="screen-loading">Loading London collision records…</p>}
    </main>;
}

function normaliseBorough(name: string) {
    return name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '');
}
