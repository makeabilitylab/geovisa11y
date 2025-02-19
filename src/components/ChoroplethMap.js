import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const ChoroplethMap = ({ dataset, showSpatialClusters, onSpatialClustersToggle, onDatasetChange, focusedState, apiUrl }) => {
    const mapContainer = useRef(null);
    const map = useRef(null);
    const popup = useRef(null);
    const [selectedDataset, setSelectedDataset] = useState('ppl_densit');
    const [geoData, setGeoData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [lisaLayer, setLisaLayer] = useState(null);
    const [lisaLegend, setLisaLegend] = useState(null);
    const [isStyleLoaded, setIsStyleLoaded] = useState(false);

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

    useEffect(() => {
        // Log environment info
        console.log('Environment Check:', {
            apiUrl,
            nodeEnv: process.env.NODE_ENV,
            mapboxToken: window.ENV?.REACT_APP_MAPBOX_TOKEN?.substring(0, 10) + '...',
            windowEnv: window.ENV,
            origin: window.location.origin
        });
    }, [apiUrl]);

    const fetchGeoJSON = async () => {
        setIsLoading(true);
        try {
            const url = `${apiUrl}/api/geojson/${selectedDataset}`;
            console.log('Fetch attempt:', {
                url,
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Origin': window.location.origin
                },
                credentials: 'include',
                mode: 'cors'
            });
            


            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Origin': window.location.origin
                },
                credentials: 'include',
                mode: 'cors',
            });

            if (!response.ok) {
                const text = await response.text();
                console.error('Error response:', text);
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('GeoJSON data received:', {
                type: data.type,
                featureCount: data.features?.length,
                firstFeature: data.features?.[0],
                properties: data.features?.[0]?.properties
            });

            if (!data.features || data.features.length === 0) {
                throw new Error('No features in GeoJSON response');
            }

            setGeoData(data);

            if (map.current) {
                const source = map.current.getSource('population');
                if (source) {
                    source.setData(data);
                    console.log('Source data updated successfully');
                } else {
                    console.error('Population source not found. Available sources:', 
                        Object.keys(map.current.getStyle().sources || {}));
                }
            } else {
                console.error('Map not initialized');
            }

            // Add this after data is received
            console.log('Data check:', {
                sourceExists: map.current?.getSource('population') ? 'yes' : 'no',
                layerExists: map.current?.getLayer('population-density') ? 'yes' : 'no',
                dataFeatures: data.features?.length,
                firstFeatureProperties: data.features?.[0]?.properties
            });

        } catch (error) {
            console.error('Fetch error details:', {
                error: error.message,
                type: error.name,
                url: `${apiUrl}/api/geojson/${selectedDataset}`,
                stack: error.stack
            });
        } finally {
            setIsLoading(false);
        }
    };


    const initializeLayers = () => {
        try {

            // Add navigation controls
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

            // Initialize popup
            if (!popup.current) {
                popup.current = new mapboxgl.Popup({
                    closeButton: false,
                    closeOnClick: false
                });
            }

            // Testing Layers
            // map.current.addSource('test-source', {
            //     type: 'geojson',
            //     data: {
            //         type: 'FeatureCollection',
            //         features: [{
            //             type: 'Feature',
            //             geometry: {
            //                 type: 'Polygon',
            //                 coordinates: [[
            //                     [-100, 40],
            //                     [-90, 40],
            //                     [-90, 35],
            //                     [-100, 35],
            //                     [-100, 40]
            //                 ]]
            //             },
            //             properties: {
            //                 name: 'Test Rectangle'
            //             }
            //         }]
            //     }
            // });

            // map.current.addLayer({
            //     id: 'test-layer',
            //     type: 'fill',
            //     source: 'test-source',
            //     paint: {
            //         'fill-color': '#ff0000',
            //         'fill-opacity': 0.7
            //     }
            // });

            // Now add the population source and layer
            map.current.addSource('population', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: []
                }
            });

            // Add state borders layer
            map.current.addLayer({
                id: 'state-borders',
                type: 'line',
                source: 'population',
                paint: {
                    'line-color': '#000',
                    'line-width': 1,
                    'line-opacity': 0
                }
            });

            // Add population density layer
            map.current.addLayer({
                id: 'population-density',
                type: 'fill',
                source: 'population',
                paint: {
                    'fill-color': [
                        'interpolate',
                        ['linear'],
                        ['get', 'value'],
                        ...datasets[selectedDataset].breaks.flatMap((break_, i) => [
                            break_,
                            datasets[selectedDataset].colors[i]
                        ])
                    ],
                    'fill-opacity': 0.75
                }
            });

            //Add LISA clusters layer
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
                        0.2, 
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
            
            // Add mousemove handler for popup
            map.current.on('mousemove', 'population-density', (e) => {
                if (e.features.length > 0) {
                    map.current.getCanvas().style.cursor = 'pointer';
                    
                    const feature = e.features[0];
                    const value = feature.properties.value;
                    const stateName = feature.properties.state_name;
                    
                    const formattedValue = `${value.toFixed(2)} ${datasets[selectedDataset].unit}`;
                    const coordinates = e.lngLat;

                    popup.current
                        .setLngLat(coordinates)
                        .setHTML(`
                            <div class="text-xs font-semibold">${stateName}</div>
                            <div class="text-xs">${formattedValue}</div>
                        `)
                        .addTo(map.current);
                }
            });

            map.current.on('mouseleave', 'population-density', () => {
                map.current.getCanvas().style.cursor = '';
                popup.current.remove();
            });

            // Fetch initial data
            fetchGeoJSON();
        } catch (error) {
            console.error('Error in initializeLayers:', error);
        }
    };

    // Initialize map
    useEffect(() => {
        if (mapContainer.current && !map.current) {
            try {
                console.log('Initializing map...');
                console.log('API URL:', apiUrl);
                
                const mapboxToken = window.ENV?.REACT_APP_MAPBOX_TOKEN || process.env.REACT_APP_MAPBOX_TOKEN;
                
                console.log('Mapbox token available:', !!mapboxToken);
                console.log('Mapbox token length:', mapboxToken?.length);
                
                if (!mapboxToken) {
                    throw new Error('Mapbox token is not configured');
                }

                mapboxgl.accessToken = mapboxToken;
                try { 
                    map.current = new mapboxgl.Map({
                        container: mapContainer.current,
                        style: 'mapbox://styles/mapbox/light-v10',
                        center: [-96, 37.8],
                        zoom: 4
                    });
                } catch (error) {
                    console.error('Error creating map:', error);
                }

                console.log('Map created successfully');

                console.log('Initializing layers...');

                map.current.on('style.load', () => {
                    console.log('Style loaded');
                    initializeLayers();
                    setIsStyleLoaded(true);
                });

            } catch (error) {
                console.error('Fatal error in map setup:', error);
            }
        }

        return () => {
            // Cleanup on unmount
            if (map.current) {
                console.log('Cleaning up map instance');
                map.current.remove();
                map.current = null;
                window.map = null;
            }
        };
    }, []);

    // Update data when dataset changes
    useEffect(() => {
        if (map.current && map.current.loaded()) {
            fetchGeoJSON();
        }
    }, [selectedDataset]);

    // Update map when dataset changes
    useEffect(() => {
        if (map.current && map.current.isStyleLoaded() && geoData) {
            const dataset = datasets[selectedDataset];
            
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
            
            map.current.setPaintProperty('population-density', 'fill-color', expression);
            map.current.setPaintProperty('population-density', 'fill-opacity', 0.75);
        }
    }, [selectedDataset, geoData]);

    // Update clusters visibility whenever showSpatialClusters changes
    useEffect(() => {
        if (map.current && map.current.isStyleLoaded()) {
            if (showSpatialClusters) {
                map.current.setLayoutProperty('lisa-clusters-fill', 'visibility', 'visible');
                map.current.setLayoutProperty('lisa-clusters', 'visibility', 'visible');
                // Also show the legend
                if (!lisaLegend) {
                    const legend = createLisaLegend();
                    map.current.getContainer().appendChild(legend);
                    setLisaLegend(legend);
                }
            } else {
                map.current.setLayoutProperty('lisa-clusters-fill', 'visibility', 'none');
                map.current.setLayoutProperty('lisa-clusters', 'visibility', 'none');
                // Remove the legend
                if (lisaLegend) {
                    lisaLegend.remove();
                    setLisaLegend(null);
                }
            }
        }
    }, [showSpatialClusters]);

    // Update effect to handle focused state(s)
    useEffect(() => {
        if (map.current && map.current.isStyleLoaded() && geoData) {
            if (focusedState === null) {
                // Reset to default view
                map.current.flyTo({
                    center: [-96, 37.8],
                    zoom: 4,
                    duration: 2000
                });
                
                // Clear state highlights
                map.current.setPaintProperty('state-borders', 'line-opacity', 0);
            } else {
                console.log('Focusing on states:', focusedState);
                
                // Handle both single state and array of states
                const statesToFocus = Array.isArray(focusedState) ? focusedState : [focusedState];
                
                // Find features for all focused states
                const features = statesToFocus.map(state => 
                    geoData.features.find(f => 
                        f.properties.state_name.toLowerCase() === state.toLowerCase()
                    )
                ).filter(f => f);
                
                if (features.length > 0) {
                    // Calculate bounds that include all states
                    const bounds = new mapboxgl.LngLatBounds();
                    
                    features.forEach(feature => {
                        const coordinates = feature.geometry.type === 'Polygon' 
                            ? [feature.geometry.coordinates[0]]
                            : feature.geometry.coordinates[0];
                        
                        coordinates.forEach(coord => {
                            bounds.extend(coord);
                        });
                    });
                    
                    // Zoom to include all states
                    map.current.fitBounds(bounds, {
                        padding: 200,
                        duration: 2000,
                        maxZoom: 5
                    });

                    // Highlight all focused states
                    map.current.setPaintProperty('state-borders', 'line-opacity', [
                        'case',
                        ['in', ['get', 'state_name'], ['literal', statesToFocus]],
                        1,
                        0
                    ]);
                    map.current.setPaintProperty('state-borders', 'line-color', '#000');
                    map.current.setPaintProperty('state-borders', 'line-width', 2);
                }
            }
        }
    }, [focusedState, geoData]);

    // Update tooltip content when dataset changes
    useEffect(() => {
        if (map.current && map.current.isStyleLoaded()) {
            // Remove existing mousemove handler
            map.current.off('mousemove', 'population-density');
            
            // Add new mousemove handler with updated dataset
            map.current.on('mousemove', 'population-density', (e) => {
                if (e.features.length > 0) {
                    map.current.getCanvas().style.cursor = 'pointer';
                    
                    const feature = e.features[0];
                    const value = feature.properties.value;
                    const stateName = feature.properties.state_name;
                    
                    // Format value based on current dataset
                    let formattedValue;
                    if (dataset === 'ppl_densit') {
                        formattedValue = `${value.toFixed(2)} people per square mile`;
                    } else {
                        formattedValue = `${value.toFixed(2)}%`;
                    }

                    const coordinates = e.lngLat;

                    popup.current
                        .setLngLat(coordinates)
                        .setHTML(`
                            <div class="text-xs font-semibold">${stateName}</div>
                            <div class="text-xs">${formattedValue}</div>
                        `)
                        .addTo(map.current);
                }
            });
        }
    }, [dataset]);

    const removeLisaLayer = () => {
        if (lisaLayer) {
            map.current.removeLayer(lisaLayer);
            setLisaLayer(null);
            setLisaLegend(null);  // Also remove the legend when layer is removed
        }
    };

    const createLisaLegend = () => {
        const div = document.createElement('div');
        div.className = 'legend';
        div.style.backgroundColor = 'white';
        div.style.padding = '10px';
        div.style.borderRadius = '5px';

        const title = document.createElement('div');
        title.innerHTML = '<strong>LISA Clusters</strong> <span class="legend-close">×</span>';
        title.style.marginBottom = '5px';
        div.appendChild(title);

        // Add click handler to the close button
        const closeButton = title.querySelector('.legend-close');
        closeButton.style.cursor = 'pointer';
        closeButton.style.float = 'right';
        closeButton.onclick = removeLisaLayer;

        return div;
    };

    // Add handler for closing LISA clusters
    const handleCloseLisaClusters = () => {
        onSpatialClustersToggle(false); 
    };

    // useEffect(() => {
    //     // Debug function available in console
    //     window.debugMap = {
    //         addTestLayer: () => {
    //             if (map.current && map.current.isStyleLoaded()) {
    //                 // Add a simple rectangle
    //                 map.current.addSource('debug', {
    //                     type: 'geojson',
    //                     data: {
    //                         type: 'Polygon',
    //                         coordinates: [[
    //                             [-100, 40],
    //                             [-90, 40],
    //                             [-90, 35],
    //                             [-100, 35],
    //                             [-100, 40]
    //                         ]]
    //                     }
    //                 });

    //                 map.current.addLayer({
    //                     id: 'debug-layer',
    //                     type: 'fill',
    //                     source: 'debug',
    //                     paint: {
    //                         'fill-color': '#ff0000',
    //                         'fill-opacity': 0.5
    //                     }
    //                 });
                    
    //                 console.log('Debug layer added');
    //             } else {
    //                 console.log('Map not ready');
    //             }
    //         },
    //         getMapState: () => {
    //             if (map.current) {
    //                 return {
    //                     loaded: map.current.loaded(),
    //                     styleLoaded: map.current.isStyleLoaded(),
    //                     sources: Object.keys(map.current.getStyle().sources || {}),
    //                     layers: map.current.getStyle().layers?.map(l => l.id),
    //                     center: map.current.getCenter(),
    //                     zoom: map.current.getZoom()
    //                 };
    //             }
    //             return 'Map not initialized';
    //         }
    //     };
    // }, []);

    return (
        <div className="relative h-full">
            <div ref={mapContainer} className="h-full" />

            {/* Loading Dialog - Show when map is not initialized or style not loaded */}
            {(!map.current || !isStyleLoaded) && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30">
                    <div className="bg-white p-4 rounded-lg shadow-lg">
                        <div className="flex items-center space-x-3">
                            <svg className="animate-spin h-5 w-5 text-teal-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span className="text-gray-700">Initializing map...</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Your existing loading dialog for data fetching */}
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

            {/* LISA Clusters Legend with close button */}
            {showSpatialClusters && (
                <div className="absolute bottom-0 left-0 bg-white p-4 m-4 rounded-lg shadow-lg opacity-90">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-sm font-bold">Hot and Cold Spots</h3>
                        <button
                            onClick={handleCloseLisaClusters}
                            className="text-gray-500 hover:text-gray-700 text-xl font-bold"
                        >
                            ×
                        </button>
                    </div>
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
