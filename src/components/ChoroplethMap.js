import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';

const ChoroplethMap = ({ onStateClick, selectedStates, showSpatialClusters, onSpatialClustersToggle, onDatasetChange }) => {
    const mapContainer = useRef(null);
    const map = useRef(null);
    const [selectedDataset, setSelectedDataset] = useState('ppl_densit');
    const [geoData, setGeoData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    const datasets = {
        ppl_densit: {
            name: 'Population Density',
            unit: 'people per square mile',
            breaks: [0, 100, 1000, 8000, 12000],
            colors: ['#F2F12D', '#E6B71E', '#CA8323', '#8B4225', '#723122']
        },
        walk_to_wo: {
            name: 'Walking to Work',
            unit: 'percent',
            breaks: [0, 1, 2.5, 5, 10],
            colors: ['#edf8fb', '#b2e2e2', '#66c2a4', '#2ca25f', '#006d2c']
        },
        transit_to: {
            name: 'Public Transit to Work',
            unit: 'percent',
            breaks: [0, 1, 2.5, 5, 10],
            colors: ['#f1eef6', '#bdc9e1', '#74a9cf', '#2b8cbe', '#045a8d']
        }
    };

    // Fetch GeoJSON data when dataset changes
    useEffect(() => {
        const fetchGeoJSON = async () => {
            setIsLoading(true);
            try {
                const apiUrl = `${process.env.REACT_APP_API_URL}/geojson/${selectedDataset}`;
                console.log('Fetching GeoJSON from:', apiUrl);

                const response = await fetch(apiUrl, {
                    method: 'GET',
                    mode: 'cors',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Error response:', errorText);
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }

                const data = await response.json();
                console.log('GeoJSON Response Stats:', {
                    featureCount: data.features.length,
                    valueRange: {
                        min: Math.min(...data.features.map(f => f.properties.value)),
                        max: Math.max(...data.features.map(f => f.properties.value))
                    }
                });
                setGeoData(data);

                // Update the map source if it exists
                if (map.current && map.current.getSource('population')) {
                    map.current.getSource('population').setData(data);
                    
                    // Set the fill-opacity back to 0.75 after data is loaded
                    setTimeout(() => {
                        if (map.current) {
                            map.current.setPaintProperty('population-density', 'fill-opacity', 0.75);
                        }
                    }, 100); // Small delay to ensure data is rendered
                }
            } catch (error) {
                console.error('Error fetching GeoJSON data:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchGeoJSON();
    }, [selectedDataset]);

    // Update map when dataset changes
    useEffect(() => {
        if (map.current && map.current.isStyleLoaded() && geoData) {
            const dataset = datasets[selectedDataset];
            console.log('Selected Dataset:', selectedDataset);
            console.log('Dataset Configuration:', dataset);
            
            // Set fill-opacity to 0 before updating colors
            map.current.setPaintProperty('population-density', 'fill-opacity', 0);
            
            // Log some sample values from the data
            const sampleValues = geoData.features
                .slice(0, 5)
                .map(feature => ({
                    state: feature.properties.state_name,
                    value: feature.properties.value,
                    raw_value: feature.properties[selectedDataset]
                }));
            console.log('Sample Values:', sampleValues);
            
            // Log the expression being used for coloring
            const expression = [
                'interpolate',
                ['linear'],
                ['coalesce',
                    ['get', 'value'],
                    0
                ],
                ...dataset.breaks.flatMap((break_, i) => [
                    break_,
                    dataset.colors[i]
                ])
            ];

            console.log('Color Expression:', expression);
            map.current.setPaintProperty('population-density', 'fill-color', expression);
        }
    }, [selectedDataset, geoData]);

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

            // Add choropleth layer with initial transparent fill
            map.current.addLayer({
                id: 'population-density',
                type: 'fill',
                source: 'population',
                paint: {
                    'fill-color': [
                        'interpolate',
                        ['linear'],
                        ['coalesce',
                            ['get', 'value'],
                            0
                        ],
                        ...datasets[selectedDataset].breaks.flatMap((break_, i) => [
                            break_,
                            datasets[selectedDataset].colors[i]
                        ])
                    ],
                    'fill-opacity': 0
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
                    const feature = e.features[0];
                    const stateId = feature.properties.GEOID;
                    const stateName = feature.properties.state_name;
                    const value = feature.properties.value;
                    
                    // Get the current dataset configuration
                    const dataset = datasets[selectedDataset];
                    
                    // Calculate the color based on the value
                    let color = dataset.colors[0];
                    for (let i = 0; i < dataset.breaks.length; i++) {
                        if (value >= dataset.breaks[i]) {
                            color = dataset.colors[i];
                        }
                    }

                    console.log('Clicked State Details:', {
                        state: stateName,
                        dataset: dataset.name,
                        value: `${value}${dataset.unit === 'percent' ? '%' : ''}`,
                        unit: dataset.unit,
                        color: color
                    });

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

            {/* Loading Dialog */}
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30">
                    <div className="bg-white p-4 rounded-lg shadow-lg">
                        <div className="flex items-center space-x-3">
                            <svg className="animate-spin h-5 w-5 text-teal-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span className="text-gray-700">Loading map data...</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Dataset Selector and Legend Container */}
            <div className="absolute top-0 left-0 bg-white p-4 m-4 rounded-lg shadow-lg opacity-90">
                {/* Dataset Selector */}
                <div className="mb-4">
                    <h3 className="text-sm font-bold mb-2">Dataset</h3>
                    <select
                        value={selectedDataset}
                        onChange={(e) => {
                            setSelectedDataset(e.target.value);
                            onDatasetChange(e.target.value);
                        }}
                        className="block w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="ppl_densit">Population Density</option>
                        <option value="walk_to_wo">Walking to Work</option>
                        <option value="transit_to">Public Transit to Work</option>
                    </select>
                </div>

                {/* Legend */}
                {/* <h3 className="text-sm font-bold mb-2">{datasets[selectedDataset].name}</h3> */}
                <div className="flex flex-col gap-1">
                    {datasets[selectedDataset].breaks.map((value, i) => (
                        <div key={i} className="flex items-center">
                            <div 
                                className="w-4 h-4 mr-2" 
                                style={{ backgroundColor: datasets[selectedDataset].colors[i] }}
                            />
                            <span className="text-xs">
                                {value}{i === datasets[selectedDataset].breaks.length - 1 ? '+' : ''}
                                {selectedDataset === 'ppl_densit' ? '' : '%'}
                            </span>
                        </div>
                    ))}
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
