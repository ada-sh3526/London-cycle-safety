import { createFileRoute } from '@tanstack/react-router';
import { Layer, Map, Popup, Source } from '@vis.gl/react-maplibre';
import { useEffect, useMemo, useState } from 'react';

import 'maplibre-gl/dist/maplibre-gl.css';

type CollisionEvent = {
    id: string;
    collisionId: string;
    borough: string;
    severity: number;
    severityLabel: string;
    date: string | null;
    month: number | null;
    hour: number | null;
    roadType: string;
    junction: string;
    latitude: number | null;
    longitude: number | null;
    age: number | null;
};

type BoroughSummary = {
    name: string;
    casualties: number;
    collisions: number;
    fatal: number;
    serious: number;
    slight: number;
};

type SafetyData = {
    meta: { title: string; source: string; sourceUrl: string; riskSourceUrl: string; scope: string; method: string; mapNote: string };
    summary: {
        cyclistCasualties: number;
        uniqueCollisions: number;
        fatal: number;
        serious: number;
        slight: number;
        ksi: number;
        mappedCasualties: number;
        mappedShare: number;
        topBorough: string;
        topBoroughCount: number;
        ksiRate2025: number;
        injuryRate2025: number;
        cycleJourneysMillions2025: number;
    };
    boroughs: BoroughSummary[];
    monthly: Array<{ month: number; label: string; count: number }>;
    hourly: Array<{ hour: number; count: number }>;
    riskSeries: Array<{ year: number; injuryPerMillionJourneys: number | null; fatalPerMillionJourneys: number | null; ksiPerMillionJourneys: number | null; journeysMillions: number | null }>;
    severity: Array<{ name: string; count: number }>;
    roadTypes: Array<{ name: string; count: number }>;
    events: CollisionEvent[];
};

type BoroughBoundaries = {
    type: 'FeatureCollection';
    features: Array<{
        type: 'Feature';
        properties: { name: string; gss_code: string; ons_inner: string; casualties?: number };
        geometry: { type: 'Polygon'; coordinates: number[][][] };
    }>;
};

type MapHoverInfo =
    | { kind: 'borough'; longitude: number; latitude: number; name: string; casualties: number }
    | { kind: 'casualty'; longitude: number; latitude: number; borough: string; severityLabel: string; date: string | null; roadType: string; junction: string };

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

export const Route = createFileRoute('/')({ component: SafetyDashboard });

function SafetyDashboard() {
    const [data, setData] = useState<SafetyData | null>(null);
    const [boundaries, setBoundaries] = useState<BoroughBoundaries | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [severity, setSeverity] = useState<'all' | 'ksi' | 'serious' | 'slight'>('all');
    const [borough, setBorough] = useState('All London');
    const [month, setMonth] = useState<number | null>(null);
    const [showSeverityPoints, setShowSeverityPoints] = useState(false);
    const [isMapExpanded, setIsMapExpanded] = useState(false);
    const [hoverInfo, setHoverInfo] = useState<MapHoverInfo | null>(null);

    useEffect(() => {
        if (!isMapExpanded) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') closeFocusedMap();
        };
        window.addEventListener('keydown', closeOnEscape);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', closeOnEscape);
        };
    }, [isMapExpanded]);

    useEffect(() => {
        const controller = new AbortController();
        Promise.all([
            fetch('/data/london-cyclist-safety-2025.json', { signal: controller.signal }),
            fetch('/data/london-boroughs.geojson', { signal: controller.signal })
        ])
            .then(async ([datasetResponse, boundaryResponse]) => {
                if (!datasetResponse.ok) throw new Error(`Dataset request failed (${datasetResponse.status})`);
                if (!boundaryResponse.ok) throw new Error(`Borough boundary request failed (${boundaryResponse.status})`);
                const [dataset, boundaryData] = await Promise.all([
                    datasetResponse.json() as Promise<SafetyData>,
                    boundaryResponse.json() as Promise<BoroughBoundaries>
                ]);
                setData(dataset);
                setBoundaries(boundaryData);
            })
            .catch((cause: unknown) => {
                if (cause instanceof Error && cause.name !== 'AbortError') setError(cause.message);
            });
        return () => controller.abort();
    }, []);

    const boroughNames = useMemo(
        () => data?.boroughs.map((item) => item.name) ?? [],
        [data]
    );
    const filteredEvents = useMemo(() => {
        if (!data) return [];
        return data.events.filter((event) => {
            const severityMatch =
                severity === 'all' ||
                (severity === 'ksi' && event.severity <= 2) ||
                (severity === 'serious' && event.severity === 2) ||
                (severity === 'slight' && event.severity === 3);
            return severityMatch && (borough === 'All London' || event.borough === borough) && (month === null || event.month === month);
        });
    }, [borough, data, month, severity]);

    const summary = useMemo(() => {
        const collisions = new Set(filteredEvents.map((event) => event.collisionId));
        return {
            casualties: filteredEvents.length,
            collisions: collisions.size,
            fatal: filteredEvents.filter((event) => event.severity === 1).length,
            serious: filteredEvents.filter((event) => event.severity === 2).length,
            slight: filteredEvents.filter((event) => event.severity === 3).length
        };
    }, [filteredEvents]);

    const filteredBoroughs = useMemo(() => {
        if (!data) return [];
        if (borough !== 'All London') {
            const item = data.boroughs.find((candidate) => candidate.name === borough);
            return item ? [summariseBorough(item.name, filteredEvents)] : [];
        }
        return data.boroughs
            .map((item) => summariseBorough(item.name, filteredEvents))
            .sort((a, b) => b.casualties - a.casualties);
    }, [borough, data, filteredEvents]);

    const mapData = useMemo(
        () => ({
            type: 'FeatureCollection' as const,
            features: filteredEvents
                .filter((event) => event.longitude !== null && event.latitude !== null)
                .map((event) => ({
                    type: 'Feature' as const,
                    properties: {
                        severity: event.severity,
                        severityLabel: event.severityLabel,
                        borough: event.borough,
                        date: event.date,
                        roadType: event.roadType,
                        junction: event.junction
                    },
                    geometry: {
                        type: 'Point' as const,
                        coordinates: [event.longitude as number, event.latitude as number]
                    }
                }))
        }),
        [filteredEvents]
    );

    const boroughMapData = useMemo(() => {
        const counts = new globalThis.Map<string, number>();
        filteredEvents.forEach((event) => {
            const key = normaliseBorough(event.borough);
            counts.set(key, (counts.get(key) ?? 0) + 1);
        });
        if (!boundaries) return null;
        const features = boundaries.features.map((feature) => ({
            ...feature,
            properties: {
                ...feature.properties,
                casualties: counts.get(normaliseBorough(feature.properties.name)) ?? 0
            }
        }));
        return {
            type: 'FeatureCollection' as const,
            features: showSeverityPoints && borough !== 'All London'
                ? features.filter((feature) => normaliseBorough(feature.properties.name) === normaliseBorough(borough))
                : features
        };
    }, [borough, boundaries, filteredEvents, showSeverityPoints]);
    const maxBoroughCount = Math.max(1, ...(boroughMapData?.features.map((feature) => feature.properties.casualties ?? 0) ?? []));
    const mapBounds = useMemo(() => {
        if (!boundaries) return undefined;
        const selected = borough === 'All London'
            ? boundaries.features
            : boundaries.features.filter((feature) => normaliseBorough(feature.properties.name) === normaliseBorough(borough));
        return boundsForBoroughs(selected.length ? selected : boundaries.features);
    }, [boundaries, borough]);

    function closeFocusedMap() {
        setIsMapExpanded(false);
        setShowSeverityPoints(false);
        setHoverInfo(null);
    }

    function handleMapMouseMove(event: import('@vis.gl/react-maplibre').MapLayerMouseEvent) {
        const point = event.features?.find((feature) => feature.layer.id === 'cyclist-casualty-points');
        if (point) {
            const properties = point.properties ?? {};
            event.target.getCanvas().style.cursor = 'pointer';
            setHoverInfo({
                kind: 'casualty',
                longitude: event.lngLat.lng,
                latitude: event.lngLat.lat,
                borough: String(properties.borough ?? 'Unknown'),
                severityLabel: String(properties.severityLabel ?? 'Unknown'),
                date: properties.date ? String(properties.date) : null,
                roadType: String(properties.roadType ?? 'Not recorded'),
                junction: String(properties.junction ?? 'Not recorded')
            });
            return;
        }
        const area = event.features?.find((feature) => feature.layer.id === 'borough-count-fill');
        if (area) {
            const properties = area.properties ?? {};
            event.target.getCanvas().style.cursor = 'pointer';
            setHoverInfo({
                kind: 'borough', longitude: event.lngLat.lng, latitude: event.lngLat.lat,
                name: String(properties.name ?? 'London borough'), casualties: Number(properties.casualties ?? 0)
            });
            return;
        }
        event.target.getCanvas().style.cursor = '';
        setHoverInfo(null);
    }

    function handleMapClick(event: import('@vis.gl/react-maplibre').MapLayerMouseEvent) {
        const area = event.features?.find((feature) => feature.layer.id === 'borough-count-fill');
        const name = area?.properties?.name;
        if (typeof name !== 'string') return;
        const match = data?.boroughs.find((item) => normaliseBorough(item.name) === normaliseBorough(name));
        if (match) setBorough(match.name);
    }

    if (error) return <main className="safety-loading">Could not load the analysis dataset: {error}</main>;
    if (!data || !boundaries || !boroughMapData) return <main className="safety-loading">Loading London collision records…</main>;

    return (
        <main className="safety-app">
            <header className="safety-header">
                <div>
                    <p className="eyebrow">Data for Humanity · Transport safety</p>
                    <h1>How safe is cycling<br className="desktop-break" /> in London?</h1>
                    <p className="safety-deck">
                        TfL estimates <strong>{data.summary.ksiRate2025.toFixed(2)} killed or seriously injured cyclists per million cycle journey stages</strong> in 2025. That rate is below its 2010–14 baseline, but rose from 2024. Explore where the collision records sit—and what the rate does and does not prove.
                    </p>
                </div>
                <a className="wall-link" href="/screen" target="_blank" rel="noreferrer">Open wall view ↗</a>
            </header>

            <section className="filterbar" aria-label="Filter collision records">
                <label>Severity
                    <select value={severity} onChange={(event) => setSeverity(event.target.value as typeof severity)}>
                        <option value="all">All cyclist casualties</option>
                        <option value="ksi">Killed or seriously injured</option>
                        <option value="serious">Serious only</option>
                        <option value="slight">Slight only</option>
                    </select>
                </label>
                <label>Borough
                    <select value={borough} onChange={(event) => setBorough(event.target.value)}>
                        <option>All London</option>
                        {boroughNames.map((name) => <option key={name}>{name}</option>)}
                    </select>
                </label>
                <label>Month
                    <select value={month ?? ''} onChange={(event) => setMonth(event.target.value ? Number(event.target.value) : null)}>
                        <option value="">All 2025</option>
                        {data.monthly.map((item) => <option key={item.month} value={item.month}>{item.label}</option>)}
                    </select>
                </label>
                <span className="filter-count">Showing {summary.casualties.toLocaleString()} casualty records</span>
            </section>

            <section className="metric-grid" aria-label="Filtered summary">
                <Metric label="London-wide KSI rate / million cycle journey stages" value={data.summary.ksiRate2025} note="2025 TfL city-wide rate · not borough-specific" accent="amber" />
                <Metric label="Cyclist casualties" value={summary.casualties} note="TfL 2025 extract · all severities" />
                <Metric label="Killed or seriously injured" value={summary.fatal + summary.serious} note={`${percent(summary.fatal + summary.serious, summary.casualties)} of extracted casualties`} accent="red" />
                <Metric label="Annual cycle journey stages" value={data.summary.cycleJourneysMillions2025} note="2025 TfL estimate" />
            </section>

            <section className="analysis-grid">
                <article className={`analysis-panel map-panel ${isMapExpanded ? 'map-panel-expanded' : ''}`} role={isMapExpanded ? 'dialog' : undefined} aria-modal={isMapExpanded || undefined} aria-label={isMapExpanded ? 'Expanded London casualty map' : undefined}>
                    <div className="panel-heading">
                        <div><p className="eyebrow">01 · Location</p><h2>{isMapExpanded && borough !== 'All London' ? `${borough} casualty map` : 'Cyclist casualties by borough'}</h2></div>
                        <div className="map-panel-tools">
                            <span className="map-count">{mapData.features.length.toLocaleString()} casualty records</span>
                            {isMapExpanded && <label className="map-focus-select">Focus borough<select value={borough} onChange={(event) => setBorough(event.target.value)}><option>All London</option>{boroughNames.map((name) => <option key={name}>{name}</option>)}</select></label>}
                            {isMapExpanded && <button type="button" className="map-close-button" onClick={closeFocusedMap}>Close map <kbd>Esc</kbd></button>}
                        </div>
                    </div>
                    <div className="map-frame">
                        <Map
                            key={`${borough}-${showSeverityPoints}`}
                            initialViewState={{ bounds: mapBounds, fitBoundsOptions: { padding: isMapExpanded ? 90 : 62, maxZoom: showSeverityPoints ? 14.5 : 10.5 }, bearing: 0, pitch: 0 }}
                            mapStyle={MAP_STYLE}
                            cooperativeGestures
                            interactiveLayerIds={showSeverityPoints ? ['borough-count-fill', 'cyclist-casualty-points'] : ['borough-count-fill']}
                            onMouseMove={handleMapMouseMove}
                            onMouseLeave={(event) => { event.target.getCanvas().style.cursor = ''; setHoverInfo(null); }}
                            onClick={handleMapClick}
                        >
                            <Source id="borough-counts" type="geojson" data={boroughMapData}>
                                <Layer
                                    id="borough-count-fill"
                                    type="fill"
                                    paint={{
                                        'fill-color': ['interpolate', ['linear'], ['get', 'casualties'], 0, '#152326', maxBoroughCount * 0.25, '#1d5748', maxBoroughCount * 0.5, '#288868', maxBoroughCount * 0.75, '#49b98e', maxBoroughCount, '#a1e7bc'],
                                        'fill-opacity': 0.78
                                    }}
                                />
                                <Layer id="borough-boundary-lines" type="line" paint={{ 'line-color': '#8ad9c0', 'line-width': 0.8, 'line-opacity': 0.72 }} />
                                <Layer
                                    id="borough-name-labels"
                                    type="symbol"
                                    layout={{ 'text-field': ['get', 'name'], 'text-size': ['interpolate', ['linear'], ['zoom'], 8, 8, 10, 11], 'text-allow-overlap': false }}
                                    paint={{ 'text-color': '#f2faf5', 'text-halo-color': '#091315', 'text-halo-width': 1.4 }}
                                />
                            </Source>
                            <Source id="cyclist-collisions" type="geojson" data={mapData}>
                                <Layer
                                    id="cyclist-casualty-points"
                                    type="circle"
                                    layout={{ visibility: showSeverityPoints ? 'visible' : 'none' }}
                                    paint={{
                                        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2, 12, 5],
                                        'circle-color': ['match', ['get', 'severity'], 1, '#ff625c', 2, '#ffc66d', '#62ddba'],
                                        'circle-opacity': 0.62,
                                        'circle-stroke-width': 0.3,
                                        'circle-stroke-color': '#081012'
                                    }}
                                />
                            </Source>
                            {hoverInfo && <Popup longitude={hoverInfo.longitude} latitude={hoverInfo.latitude} closeButton={false} closeOnClick={false} anchor="top" className="safety-map-popup">
                                {hoverInfo.kind === 'borough'
                                    ? <div className="map-popup-copy"><strong>{hoverInfo.name}</strong><span>{hoverInfo.casualties.toLocaleString()} cyclist casualty records</span><small>Click the borough to filter the analysis</small></div>
                                    : <div className="map-popup-copy"><strong>{hoverInfo.severityLabel} cyclist casualty</strong><span>{hoverInfo.borough}{hoverInfo.date ? ` · ${hoverInfo.date}` : ''}</span><small>{hoverInfo.roadType} · {hoverInfo.junction}</small></div>}
                            </Popup>}
                        </Map>
                    </div>
                    <div className="map-key" aria-label="Map legends">
                        <div className="count-key"><strong>Borough count</strong><span>0</span><i /><span>{maxBoroughCount.toLocaleString()}</span></div>
                        <label className="point-toggle"><input type="checkbox" checked={showSeverityPoints} onChange={(event) => { const checked = event.target.checked; setShowSeverityPoints(checked); setIsMapExpanded(checked); setHoverInfo(null); }} /> Show casualty points · expand map</label>
                        <div className={`severity-key ${showSeverityPoints ? 'active' : ''}`} aria-label="Severity point colours"><span><i className="fatal-dot" /> Fatal</span><span><i className="serious-dot" /> Serious</span><span><i className="slight-dot" /> Slight</span></div>
                    </div>
                    <p className="chart-note">Borough fill shows TfL casualty records under the current filters. Expand the point view to zoom to a selected borough; hover over a borough or point for details. TfL’s OSGB36 casualty coordinates are transformed to WGS84 using the Ordnance Survey seven-parameter Helmert operation (about 3.5 m transformation accuracy). Boundaries: GLA / Ordnance Survey, OGL v3.</p>
                </article>

                <article className="analysis-panel borough-panel">
                    <div className="panel-heading"><div><p className="eyebrow">02 · Borough comparison</p><h2>Where are the most casualties recorded?</h2></div></div>
                    <p className="chart-note">Counts are not risk rates: cycling volumes differ between boroughs.</p>
                    <div className="borough-bars" role="list" aria-label="Boroughs ranked by cyclist casualties">
                        {filteredBoroughs.slice(0, borough === 'All London' ? 12 : 1).map((item, index) => {
                            const max = Math.max(1, ...filteredBoroughs.map((candidate) => candidate.casualties));
                            return <button key={item.name} className={`borough-row ${borough === item.name ? 'selected' : ''}`} onClick={() => setBorough(borough === item.name ? 'All London' : item.name)} aria-label={`Filter to ${item.name}, ${item.casualties} casualties`}>
                                <span className="borough-rank">{String(index + 1).padStart(2, '0')}</span><span className="borough-name">{item.name}</span><span className="borough-track"><i style={{ width: `${Math.max(1, item.casualties / max * 100)}%` }} /></span><strong>{item.casualties}</strong>
                            </button>;
                        })}
                    </div>
                    {borough === 'All London' && <p className="chart-note bottom-note">Select any borough to focus the map and summary on that area.</p>}
                </article>
            </section>

            <section className="risk-panel analysis-panel">
                <div className="panel-heading"><div><p className="eyebrow">03 · Exposure-adjusted risk</p><h2>The KSI rate per cycle journey stage is below the baseline, with a recent uptick</h2></div><span className="map-count">{data.summary.ksiRate2025.toFixed(2)} / million cycle journey stages in 2025</span></div>
                <p className="chart-note">TfL's published cyclist KSI casualties per million cycle journey stages · 2020–21 omitted because reliable cycle-journey-stage exposure data is unavailable.</p>
                <RiskTrendChart rows={data.riskSeries} />
                <p className="chart-note">2025 KSI risk was 6.9% higher than 2024 and 17.4% below TfL's 2010–14 baseline. TfL estimates 546.1 million cycle journey stages in 2025 (+12.4% from 2024); rates are taken directly from the official annex.</p>
            </section>

            <section className="analysis-grid secondary-grid">
                <article className="analysis-panel">
                    <div className="panel-heading"><div><p className="eyebrow">04 · Time of year</p><h2>More records in late spring and summer</h2></div></div>
                    <p className="chart-note">Monthly casualty records · 2025 · filtered to current selection</p>
                    <MonthlyChart rows={data.monthly.map((item) => ({ ...item, count: filteredEvents.filter((event) => event.month === item.month).length }))} selected={month} onSelect={setMonth} />
                </article>
                <article className="analysis-panel severity-panel">
                    <div className="panel-heading"><div><p className="eyebrow">05 · Severity &amp; context</p><h2>Most casualties were recorded as slight</h2></div></div>
                    <SeverityRows events={filteredEvents} />
                    <div className="road-context"><span className="context-label">Most common road type</span><strong>{mostCommonRoadType(filteredEvents)}</strong><span className="context-foot">Reported road classification · not a measure of road design quality</span></div>
                </article>
            </section>

            <section className="story-footer">
                <div><p className="eyebrow">What this tells us</p><h2>Collision records point to places to investigate, not a verdict on safety.</h2></div>
                <p>TfL's exposure-adjusted KSI rate per cycle journey stage fell 17.4% from its 2010–14 baseline, then rose 6.9% in 2025. Separately, Westminster has the most raw casualty records ({data.summary.topBoroughCount.toLocaleString()}). Raw borough counts are not risk rates, and neither trend establishes that infrastructure caused or prevented an injury.</p>
            </section>

            <details className="method-details">
                <summary>Data, method &amp; limitations</summary>
                <div className="method-copy">
                    <p><strong>Counts:</strong> TfL's 2025 casualty extract is filtered to <code>Casualty Mode of Travel = Pedal Cycle</code> and joined to its attendant extract by <code>_Collision Id</code>. Severity counts are 6 fatal, 1,196 serious and 4,473 slight (5,675 casualties in 5,614 distinct collisions). The official injury-risk annex separately reports rates per million cycle journey stages; the displayed rate is not recomputed from the extracted totals.</p>
                    <p><strong>Limits:</strong> TfL's injury collision data excludes near misses and damage-only incidents and will not capture every unreported injury. The risk annex has no reliable cycle-journey exposure values for 2020–21. Borough counts remain unadjusted for local cycling volume. The TfL Cycling Infrastructure Database catalogued by the London Datastore is a 2017–18 survey snapshot, so it cannot support a direct 2025 infrastructure comparison. Any causal claim needs dated infrastructure changes and matched cycling-volume exposure.</p>
                    <p><strong>Map:</strong> Borough fills use official Greater London Authority / Ordnance Survey polygons (OGL v3), joined to TfL borough counts by normalized name. Casualty dots are transformed from TfL OSGB36 / British National Grid coordinates to WGS84 with the Ordnance Survey seven-parameter Helmert operation (EPSG:1314; about 3.5 m transformation accuracy). This describes the coordinate transformation, not the source location accuracy; TfL does not state incident-level geocoding accuracy here. Raw Easting/Northing are retained.</p>
                    <p><a href={data.meta.sourceUrl} target="_blank" rel="noreferrer">TfL 2025 road collision extracts ↗</a> · <a href={data.meta.riskSourceUrl} target="_blank" rel="noreferrer">TfL Injury Risk Annex ↗</a> · <a href="https://data.london.gov.uk/dataset/london-boroughs-e55pw" target="_blank" rel="noreferrer">GLA / Ordnance Survey borough boundaries ↗</a> · <a href="https://data.london.gov.uk/dataset/cycling-infrastructure-database-23n1k" target="_blank" rel="noreferrer">TfL Cycling Infrastructure Database ↗</a></p>
                </div>
            </details>
            <footer className="safety-footer"><span>Source: TfL 2025 Collision Extracts + Injury Risk Annex</span><span>Data Observatory · London cycling safety</span></footer>
        </main>
    );
}

function summariseBorough(name: string, events: CollisionEvent[]): BoroughSummary {
    const matches = events.filter((event) => event.borough === name);
    return {
        name, casualties: matches.length,
        collisions: new Set(matches.map((event) => event.collisionId)).size,
        fatal: matches.filter((event) => event.severity === 1).length,
        serious: matches.filter((event) => event.severity === 2).length,
        slight: matches.filter((event) => event.severity === 3).length
    };
}

function Metric({ label, value, note, accent = 'mint' }: { label: string; value: number; note: string; accent?: string }) {
    return <article className={`metric-card ${accent}`}><span>{label}</span><strong>{value.toLocaleString()}</strong><small>{note}</small></article>;
}

function MonthlyChart({ rows, selected, onSelect }: { rows: Array<{ month: number; label: string; count: number }>; selected: number | null; onSelect: (month: number | null) => void }) {
    const max = Math.max(1, ...rows.map((row) => row.count));
    return <div className="month-chart" role="list" aria-label="Casualty records by month">{rows.map((row) => <button key={row.month} className={`month-col ${selected === row.month ? 'selected' : ''}`} onClick={() => onSelect(selected === row.month ? null : row.month)} aria-label={`${row.label}: ${row.count} casualties`}><span className="month-value">{row.count}</span><span className="month-track"><i style={{ height: `${Math.max(2, row.count / max * 100)}%` }} /></span><span className="month-label">{row.label}</span></button>)}</div>;
}

function RiskTrendChart({ rows }: { rows: SafetyData['riskSeries'] }) {
    const [hovered, setHovered] = useState<{ year: number; rate: number; x: number; y: number } | null>(null);
    const width = 940;
    const height = 270;
    const left = 64;
    const top = 18;
    const plotWidth = 820;
    const plotHeight = 190;
    const yMax = 3.5;
    const x = (year: number) => left + ((year - 2010) / 15) * plotWidth;
    const y = (rate: number) => top + plotHeight - (rate / yMax) * plotHeight;
    const valid = rows.filter((item) => item.ksiPerMillionJourneys !== null);
    const baseline = 2.652930195007693;
    const years = [2010, 2013, 2016, 2019, 2022, 2025];
    const path = valid.slice(1).map((item) => {
        const previous = valid.filter((candidate) => candidate.year < item.year).at(-1);
        if (!previous || previous.year + 1 !== item.year || previous.ksiPerMillionJourneys === null || item.ksiPerMillionJourneys === null) return null;
        return <line key={item.year} x1={x(previous.year)} y1={y(previous.ksiPerMillionJourneys)} x2={x(item.year)} y2={y(item.ksiPerMillionJourneys)} className="risk-line" />;
    });
    return <div className="risk-chart-wrap"><div className="risk-chart-stage"><svg className="risk-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Line chart showing cyclist killed or seriously injured casualties per million cycle journey stages from 2010 to 2025, with a gap in 2020 and 2021.">
        <title>Cyclist KSI rate per million cycle journey stages</title>
        {[0, 1, 2, 3].map((tick) => <g key={tick}><line x1={left} y1={y(tick)} x2={left + plotWidth} y2={y(tick)} className="risk-gridline" /><text x={left - 12} y={y(tick) + 4} textAnchor="end">{tick}</text></g>)}
        <line x1={left} y1={y(baseline)} x2={left + plotWidth} y2={y(baseline)} className="risk-baseline" />
        <text x={left + plotWidth - 4} y={y(baseline) - 8} textAnchor="end" className="risk-baseline-label">2010–14 average 2.65</text>
        {path}
        {valid.map((item) => {
            const rate = item.ksiPerMillionJourneys as number;
            const pointX = x(item.year);
            const pointY = y(rate);
            const showTooltip = () => setHovered({ year: item.year, rate, x: pointX / width * 100, y: pointY / height * 100 });
            return <g key={item.year}><circle cx={pointX} cy={pointY} r={11} className="risk-hit" tabIndex={0} role="graphics-symbol" aria-label={`${item.year}: ${rate.toFixed(3)} KSI casualties per million cycle journey stages`} onMouseEnter={showTooltip} onMouseMove={showTooltip} onMouseLeave={() => setHovered(null)} onFocus={showTooltip} onBlur={() => setHovered(null)} /><circle cx={pointX} cy={pointY} r={item.year >= 2024 ? 6 : 4} className={item.year === 2025 ? 'risk-point latest' : 'risk-point'} pointerEvents="none"><title>{item.year}: {rate.toFixed(3)} KSI casualties per million cycle journey stages</title></circle>{(item.year === 2024 || item.year === 2025) && <text x={pointX - 8} y={pointY - 12} textAnchor="end" className="risk-value-label">{rate.toFixed(2)}</text>}</g>;
        })}
        {years.map((year) => <text key={year} x={x(year)} y={top + plotHeight + 25} textAnchor="middle">{year}</text>)}
        <text x={left - 46} y={top + plotHeight / 2} textAnchor="middle" transform={`rotate(-90 ${left - 46} ${top + plotHeight / 2})`}>KSI casualties / million cycle journey stages</text>
        <text x={x(2020.5)} y={top + 42} textAnchor="middle" className="risk-gap-label">No reliable cycle-journey exposure</text>
    </svg>{hovered && <div className={`risk-tooltip${hovered.x > 76 ? ' left' : ''}`} style={{ left: `${hovered.x}%`, top: `${hovered.y}%` }} role="status"><strong>{hovered.year}</strong><span>{hovered.rate.toFixed(3)} KSI casualties per million cycle journey stages</span></div>}</div><div className="risk-chart-legend"><span><i />Cyclist KSI rate per million cycle journey stages</span><span className="baseline-key"><i />2010–14 average</span></div></div>;
}

function SeverityRows({ events }: { events: CollisionEvent[] }) {
    const rows = [
        { name: 'Fatal', severity: 1, color: 'fatal-fill' },
        { name: 'Serious', severity: 2, color: 'serious-fill' },
        { name: 'Slight', severity: 3, color: 'slight-fill' }
    ];
    return <div className="severity-rows">{rows.map((row) => {
        const count = events.filter((event) => event.severity === row.severity).length;
        return <div className="severity-row" key={row.name}><span>{row.name}</span><span className="severity-track"><i className={row.color} style={{ width: `${events.length ? count / events.length * 100 : 0}%` }} /></span><strong>{count.toLocaleString()}</strong><small>{percent(count, events.length)}</small></div>;
    })}</div>;
}

function mostCommonRoadType(events: CollisionEvent[]) {
    const counts = new globalThis.Map<string, number>();
    events.forEach((event) => counts.set(event.roadType, (counts.get(event.roadType) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'No records in this selection';
}

function normaliseBorough(name: string) {
    return name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '');
}

function boundsForBoroughs(features: BoroughBoundaries['features']): [[number, number], [number, number]] {
    const positions = features.flatMap((feature) => feature.geometry.coordinates.flat(1));
    const longitudes = positions.map(([longitude]) => longitude);
    const latitudes = positions.map(([, latitude]) => latitude);
    return [
        [Math.min(...longitudes), Math.min(...latitudes)],
        [Math.max(...longitudes), Math.max(...latitudes)]
    ];
}

function percent(value: number, total: number) {
    return total ? `${(value / total * 100).toFixed(1)}%` : '0.0%';
}
