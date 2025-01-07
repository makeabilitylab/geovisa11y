import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';

const ChoroplethMap = ({ onStateClick, selectedStates, showSpatialClusters, onSpatialClustersToggle }) => {
    const mapContainer = useRef(null);
    const map = useRef(null);
    const [geoData, setGeoData] = useState(null); // State to store GeoJSON data

    // Fetch GeoJSON data from Flask backend
    useEffect(() => {
        const fetchGeoJSON = async () => {
            try {
                const apiUrl = `${process.env.REACT_APP_API_URL}/geojson/population-density`;
                console.log('Fetching GeoJSON from:', apiUrl);

                const response = await fetch(apiUrl);
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }

                const data = await response.json();
                console.log('Fetched GeoJSON data:', data);

                setGeoData(data); // Store fetched data
            } catch (error) {
                console.error('Error fetching GeoJSON data:', error);
            }
        };

        fetchGeoJSON();
    }, []);

    // Update borders whenever selectedStates changes
    useEffect(() => {
        if (map.current && map.current.isStyleLoaded() && geoData) {
            console.log('Selected states:', selectedStates);

            const selectedStateIds = selectedStates.map((state) => state.id);
            console.log('Selected state GEOIDs:', selectedStateIds);

            map.current.setPaintProperty('state-borders', 'line-opacity', [
                'case',
                ['in', ['get', 'GEOID'], ['literal', selectedStateIds]],
                1,
                0
            ]);
        }
    }, [selectedStates, geoData]);

    // Update clusters visibility whenever showSpatialClusters changes
    useEffect(() => {
        if (map.current && map.current.isStyleLoaded()) {
            map.current.setLayoutProperty(
                'lisa-clusters-fill',
                'visibility',
                showSpatialClusters ? 'visible' : 'none'
            );
            map.current.setLayoutProperty(
                'lisa-clusters',
                'visibility',
                showSpatialClusters ? 'visible' : 'none'
            );
        }
    }, [showSpatialClusters]);

    useEffect(() => {
        if (!geoData) {
            console.log('GeoJSON not yet loaded. Waiting...');
            return;
        }

        if (map.current) {
            console.log('Map already initialized.');
            return;
        }

        console.log('Initializing Mapbox map...');
        mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

        map.current = new mapboxgl.Map({
            container: mapContainer.current,
            style: 'mapbox://styles/mapbox/light-v10',
            center: [-96, 37.8],
            zoom: 4
        });

        // Add navigation controls
        console.log('Adding navigation controls...');
        map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
        map.current.addControl(new mapboxgl.FullscreenControl(), 'top-right');
        map.current.addControl(new mapboxgl.ScaleControl(), 'bottom-right');
        map.current.addControl(
            new mapboxgl.GeolocateControl({
                positionOptions: { enableHighAccuracy: true },
                trackUserLocation: true
            }),
            'top-right'
        );

        map.current.on('load', () => {
            console.log('Map loaded. Adding layers...');

            // Add GeoJSON source
            map.current.addSource('population', {
                type: 'geojson',
                data: geoData
            });

            // Add choropleth layer
            map.current.addLayer({
                id: 'population-density',
                type: 'fill',
                source: 'population',
                paint: {
                    'fill-color': [
                        'interpolate',
                        ['linear'],
                        ['get', 'ppl_densit'],
                        0, '#F2F12D',
                        100, '#E6B71E',
                        1000, '#CA8323',
                        8000, '#8B4225',
                        12000, '#723122'
                    ],
                    'fill-opacity': 0.75
                }
            });
                   // Add LISA cluster fills
                   map.current.addLayer({
                    id: 'lisa-clusters-fill',
                    type: 'fill',
                    source: 'population',
                    layout: {
                        'visibility': 'none'  // Initially hidden
                    },
                    paint: {
                        'fill-color': [
                            'match',
                            ['get', 'lisa_class'],
                            'LL', '#01579b',  // Blue for Low-Low
                            'HL', '#f06292',  // Pink for High-Low
                            'LH', '#00bcd4',  // Light Blue for Low-High
                            'HH', '#d81b60',  // Red for High-High
                            'transparent'
                        ],
                        'fill-opacity': [
                            'case',
                            ['has', 'lisa_class'],
                            0.2,  // Lower opacity for fills
                            0
                        ]
                    }
                });

            // Add LISA cluster outlines
            map.current.addLayer({
                id: 'lisa-clusters',
                type: 'line',
                source: 'population',
                layout: {
                    'visibility': 'none'  // Initially hidden
                },
                paint: {
                    'line-color': [
                        'match',
                        ['get', 'lisa_class'],
                        'LL', '#01579b',  // Blue for Low-Low
                        'HL', '#f06292',  // Pink for High-Low
                        'LH', '#00bcd4',  // Light Blue for Low-High
                        'HH', '#d81b60',  // Red for High-High
                        'transparent'
                    ],
                    'line-width': 2,
                    'line-opacity': [
                        'case',
                        ['has', 'lisa_class'],
                        0.8,
                        0
                    ],
                    'line-offset': 1,
                    'line-join': 'round',
                }
            });

            // Add state borders layer
            map.current.addLayer({
                id: 'state-borders',
                type: 'line',
                source: 'population',
                paint: {
                    'line-color': '#627BC1',
                    'line-width': 2,
                    'line-opacity': 0
                }
            });

            console.log('Layers added. Setting up interactions...');

            // Click geometry interaction
            map.current.on('click', 'population-density', (e) => {
                if (e.features && e.features.length > 0) {
                    const stateId = e.features[0].properties.GEOID;
                    const stateName = e.features[0].properties.state_name;

                    console.log('State clicked:', { stateId, stateName });

                    // Call the callback with state info
                    onStateClick(stateId, stateName);
                }
            });

            // Change cursor on hover
            map.current.on('mouseenter', 'population-density', () => {
                map.current.getCanvas().style.cursor = 'pointer';
            });

            map.current.on('mouseleave', 'population-density', () => {
                map.current.getCanvas().style.cursor = '';
            });
        });
    }, [geoData, onStateClick]);

    return (
        <div className="relative h-full">
            <div ref={mapContainer} className="h-full" />

            {/* Population Density Legend */}
            <div className="absolute top-0 left-0 bg-white p-4 m-4 rounded-lg shadow-lg opacity-90">
                <h3 className="text-sm font-bold mb-2">Population Density</h3>
                <div className="flex flex-col gap-1">
                    <div className="flex items-center">
                        <div className="w-4 h-4 bg-[#F2F12D] mr-2"></div>
                        <span className="text-xs">0</span>
                    </div>
                    <div className="flex items-center">
                        <div className="w-4 h-4 bg-[#E6B71E] mr-2"></div>
                        <span className="text-xs">100</span>
                    </div>
                    <div className="flex items-center">
                        <div className="w-4 h-4 bg-[#CA8323] mr-2"></div>
                        <span className="text-xs">1,000</span>
                    </div>
                    <div className="flex items-center">
                        <div className="w-4 h-4 bg-[#8B4225] mr-2"></div>
                        <span className="text-xs">8,000</span>
                    </div>
                    <div className="flex items-center">
                        <div className="w-4 h-4 bg-[#723122] mr-2"></div>
                        <span className="text-xs">12,000+</span>
                    </div>
                </div>
            </div>

            {/* LISA Clusters Legend - Only show when clusters are visible */}
            {showSpatialClusters && (
                <div className="absolute bottom-0 left-0 bg-white p-4 m-4 rounded-lg shadow-lg opacity-90">
                    <h3 className="text-sm font-bold mb-2">Hot and Cold Spots</h3>
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center">
                            <div className="w-4 h-4 mr-2 border-2 border-[#d81b60] bg-[#d81b60] bg-opacity-20"></div>
                            <span className="text-xs">High-High Cluster</span>
                        </div>
                        <div className="flex items-center">
                            <div className="w-4 h-4 mr-2 border-2 border-[#01579b] bg-[#01579b] bg-opacity-20"></div>
                            <span className="text-xs">Low-Low Cluster</span>
                        </div>
                        <div className="flex items-center">
                            <div className="w-4 h-4 mr-2 border-2 border-[#f06292] bg-[#f06292] bg-opacity-20"></div>
                            <span className="text-xs">High-Low Outlier</span>
                        </div>
                        <div className="flex items-center">
                            <div className="w-4 h-4 mr-2 border-2 border-[#00bcd4] bg-[#00bcd4] bg-opacity-20"></div>
                            <span className="text-xs">Low-High Outlier</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChoroplethMap;
