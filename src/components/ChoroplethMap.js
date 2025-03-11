import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { logMapInteraction } from '../utils/logger';

const ChoroplethMap = ({
    focus = { type: null, states: [], county: null, city: null, highlightOnly: false },
    onFocusChange,
    dataset, 
    showSpatialClusters, 
    onSpatialClustersToggle, 
    onDatasetChange,  
    apiUrl, 
    isMapInteractive, 
    onMapClick,
    showingCounties,
    onShowingCountiesChange,
    isTaskPage = false,
}) => 
        {
    const mapContainer = useRef(null);
    const map = useRef(null);
    const popup = useRef(null);
    const [selectedDataset, setSelectedDataset] = useState(
        isTaskPage ? 'pct_tot_co' : 
        'ppl_densit'
    );
    const [geoData, setGeoData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [lisaLayer, setLisaLayer] = useState(null);
    const [lisaLegend, setLisaLegend] = useState(null);
    const [layersInitialized, setLayersInitialized] = useState(false);

    const [stateAnnouncement, setStateAnnouncement] = useState('');
    const announcementRef = useRef(null);

    const [countyData, setCountyData] = useState(null);

    const datasets = isTaskPage ? {
        'pct_tot_co': {
            name: 'Underserved Population',
            breaks: [75, 80, 85, 90, 95],
            colors: ['#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5']
        },
        'pct_no_bb_': {
            name: 'Lacking Broadband Access',
            breaks: [5, 7.5, 10, 12.5, 15,],
            colors: ['#e5f5e0', '#c7e9c0', '#a1d99b', '#74c476', '#41ab5d', '#238b45']
        }
    } : {
        'ppl_densit': {
            name: 'Population Density',
            breaks: [10, 50, 100, 200, 500, 1000],
            colors: ["#fef6b5", "#ffdd9a", "#ffc285", "#ffa679", "#fa8a76", "#f16d7a", "#e15383"]

        }
    };

      // Add this useEffect to handle keyboard shortcuts for dataset switching
      useEffect(() => {
        const handleKeyDown = (e) => {
            // Check for Ctrl + / shortcut
            if (e.ctrlKey && e.key === '/') {
                e.preventDefault();
                
                // Toggle between available datasets
                if (isTaskPage) {
                    // For task page, toggle between the two datasets
                    const newDataset = selectedDataset === 'pct_tot_co' ? 'pct_no_bb_' : 'pct_tot_co';
                    setSelectedDataset(newDataset);
                    onDatasetChange(newDataset);
                    
                    // Announce dataset change for accessibility
                    const datasetName = datasets[newDataset]?.name || newDataset;
                    setStateAnnouncement(`Dataset changed to ${datasetName}`);
                }
                // For non-task page, there's only one dataset option, so no toggle needed
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedDataset, isTaskPage, onDatasetChange, datasets]);

    // Add these utility functions for layer management
    const toggleLayerVisibility = useCallback((layerId, isVisible) => {
        if (!map.current || !map.current.getStyle()) return;
        
        if (map.current.getLayer(layerId)) {
            map.current.setLayoutProperty(
                layerId, 
                'visibility', 
                isVisible ? 'visible' : 'none'
            );
            console.log(`Layer ${layerId} visibility set to ${isVisible ? 'visible' : 'none'}`);
        } else {
            console.warn(`Layer ${layerId} not found in map`);
        }
    }, []);

    const toggleLayerSet = useCallback((layerConfig, isVisible) => {
        if (!map.current) return;
        
        layerConfig.forEach(layerId => {
            toggleLayerVisibility(layerId, isVisible);
        });
    }, [toggleLayerVisibility]);

    // Define layer groups
    const stateLayers = useMemo(() => ['state-choropleth', 'state-borders'], []);
    const stateLisaLayers = useMemo(() => ['state-lisa-clusters-fill', 'state-lisa-clusters-border'], []);
    const countyLayers = useMemo(() => ['county-choropleth', 'county-borders'], []);
    const countyLisaLayers = useMemo(() => ['county-lisa-clusters-fill', 'county-lisa-clusters-border'], []);

    // Function to check if a layer exists
    const layerExists = useCallback((layerId) => {
        return map.current && map.current.getLayer(layerId);
    }, []);

    // Function to check if a source exists
    const sourceExists = useCallback((sourceId) => {
        return map.current && map.current.getSource(sourceId);
    }, []);

    // Function to remove layers safely
    const removeLayersSafely = useCallback((layerIds) => {
        if (!map.current) return;
        
        layerIds.forEach(layerId => {
            if (layerExists(layerId)) {
                map.current.removeLayer(layerId);
                console.log(`Layer ${layerId} removed`);
            }
        });
    }, [layerExists]);

    // Function to remove a source safely
    const removeSourceSafely = useCallback((sourceId) => {
        if (!map.current) return;
        
        if (sourceExists(sourceId)) {
            map.current.removeSource(sourceId);
            console.log(`Source ${sourceId} removed`);
        }
    }, [sourceExists]);

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

    const fetchData = async () => {
        setIsLoading(true);
        try {
            
            const response = await fetch(`${apiUrl}/api/geojson/${selectedDataset}`, {
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
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Fetched data:', data);
            setGeoData(data);

            if (map.current) {
                const source = map.current.getSource('states');
                if (source) {
                    source.setData(data);
                    console.log('Source data updated successfully');
                } else {
                    console.error('Population source not found');
                }
            }
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const initializeLayers = () => {
        try {
            // Add navigation controls
            map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
            // Make nav control buttons inaccessible to screen readers
            const navButtons = mapContainer.current.getElementsByClassName('mapboxgl-ctrl-group')[0];
            if (navButtons) {
                navButtons.setAttribute('aria-hidden', 'true');
                navButtons.setAttribute('tabindex', '-1');
                const buttons = navButtons.getElementsByTagName('button');
                Array.from(buttons).forEach(button => {
                    button.setAttribute('tabindex', '-1');
                    button.setAttribute('aria-hidden', 'true');
                });
            }

            // Add fullscreen control
            map.current.addControl(new mapboxgl.FullscreenControl(), 'top-right');
            // Make fullscreen control inaccessible to screen readers
            const fullscreenButton = mapContainer.current.getElementsByClassName('mapboxgl-ctrl-fullscreen')[0];
            if (fullscreenButton) {
                fullscreenButton.setAttribute('aria-hidden', 'true');
                fullscreenButton.setAttribute('tabindex', '-1');
            }

            // Add scale control
            map.current.addControl(new mapboxgl.ScaleControl(), 'bottom-right');
            // Make scale control inaccessible to screen readers
            const scaleElement = mapContainer.current.getElementsByClassName('mapboxgl-ctrl-scale')[0];
            if (scaleElement) {
                scaleElement.setAttribute('aria-hidden', 'true');
            }

            const geolocateButton = mapContainer.current.getElementsByClassName('mapboxgl-ctrl-geolocate')[0];
            if (geolocateButton) {
                geolocateButton.setAttribute('aria-hidden', 'true');
                geolocateButton.setAttribute('tabindex', '-1');
            }

            // Initialize popup
            if (!popup.current) {
                popup.current = new mapboxgl.Popup({
                    closeButton: false,
                    closeOnClick: false
                });
            }

            // Add the population source
            map.current.addSource('states', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: []
                }
            });

            // Add population density layer first (bottom layer)
            map.current.addLayer({
                id: 'state-choropleth',
                type: 'fill',
                source: 'states',
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

            // Add LISA clusters layer next
            map.current.addLayer({
                id: 'state-lisa-clusters-fill',
                type: 'fill',
                source: 'states',
                layout: {
                    'visibility': 'none'
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
                id: 'state-lisa-clusters-border',
                type: 'line',
                source: 'states',
                layout: {
                    'visibility': 'none'
                },
                paint: {
                    'line-color': [
                        'match',
                        ['get', 'lisa_class'],
                        'LL', '#01579b',
                        'HL', '#f06292',
                        'LH', '#00bcd4',
                        'HH', '#d81b60',
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

            // Add state borders layer last (top layer)
            map.current.addLayer({
                id: 'state-borders',
                type: 'line',
                source: 'states',
                paint: {
                    'line-color': '#000',
                    'line-width': 1,
                    'line-opacity': 0.7,
                },
                // Ensure this layer is always on top
                maxzoom: 24
            });

            // Add mousemove handler for popup
            map.current.on('mousemove', 'state-choropleth', (e) => {
                if (e.features.length > 0) {
                    map.current.getCanvas().style.cursor = 'pointer';
                    
                    const feature = e.features[0];
                    const value = feature.properties.value;
                    const stateName = feature.properties.state_name;
                    
                    // Check if value is defined before calling toFixed()
                    const formattedValue = value !== undefined && value !== null 
                        ? `${value.toFixed(2)} ${datasets[selectedDataset].unit || ''}`
                        : 'N/A';
                    
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

            map.current.on('mouseleave', 'state-choropleth', () => {
                map.current.getCanvas().style.cursor = '';
                popup.current.remove();
            });

            // Fetch initial data
            fetchData();

        } catch (error) {
            console.error('Error in initializeLayers:', error);
        }
    };

    // Update the map initialization useEffect
    useEffect(() => {
        if (mapContainer.current && !map.current) {
            try {
                console.log('Map initialization starting...');
                
                const mapboxToken = window.ENV?.REACT_APP_MAPBOX_TOKEN || process.env.REACT_APP_MAPBOX_TOKEN;
                
                if (!mapboxToken) {
                    throw new Error('Mapbox token is missing');
                }

                mapboxgl.accessToken = mapboxToken;

                map.current = new mapboxgl.Map({
                    container: mapContainer.current,
                    style: 'mapbox://styles/mapbox/light-v10',
                    center: [-96, 37.8],
                    zoom: 4
                });

                // Set up layers once when style loads
                map.current.once('style.load', () => {
                    console.log('Style loaded, initializing layers...');
                    initializeLayers();
                    setLayersInitialized(true);
                });

            } catch (error) {
                console.error('Map initialization error:', error);
            }
        }

        return () => {
            if (map.current) {
                map.current.remove();
                map.current = null;
            }
        };
    }, []);

    // Update data when dataset changes
    useEffect(() => {
        if (map.current && map.current.loaded()) {
            // Turn off LISA layers when dataset changes
            if (showSpatialClusters) {
                onSpatialClustersToggle(false);
            }
            
            // Reset to default view
            map.current.flyTo({
                center: [-96, 37.8],
                zoom: 4,
                duration: 2000
            });
            
            // Clear state highlights
            map.current.setPaintProperty('state-borders', 'line-opacity', 0);
            
            // Clear county map layers/sources
            removeLayersSafely(countyLayers.concat(countyLisaLayers));
            removeSourceSafely('counties');
            
            // Announce dataset change
            const datasetName = datasets[selectedDataset]?.name || selectedDataset;
            setStateAnnouncement(`Dataset changed to ${datasetName}`);
            
            // Reset focused state
            onFocusChange({
                type: null,
                states: [],
                county: null,
                city: null,
                highlightOnly: false
            });
            
            // Fetch new data
            fetchData();
        }
    }, [selectedDataset, removeLayersSafely, removeSourceSafely, countyLayers, countyLisaLayers]);

    // Update map when dataset changes
    useEffect(() => {
        if (map.current && layersInitialized && geoData) {
            const dataset = datasets[selectedDataset];
            const expression = [
                'interpolate',
                ['linear'],
                ['coalesce', ['get', 'value'], 0],
                ...dataset.breaks.flatMap((break_, i) => [
                    break_,
                    dataset.colors[i]
                ])
            ];
            
            map.current.setPaintProperty('state-choropleth', 'fill-color', expression);
            map.current.setPaintProperty('state-choropleth', 'fill-opacity', 0.75);
        }
    }, [selectedDataset, geoData, layersInitialized]);

    // Update clusters visibility whenever showSpatialClusters changes
    useEffect(() => {
        if(!isMapInteractive) {
            return;
        }
        if (map.current && layersInitialized) {
            try {
                toggleLayerSet(stateLisaLayers, showSpatialClusters);
                
                if (showSpatialClusters && !lisaLegend) {
                    const legend = createLisaLegend();
                    map.current.getContainer().appendChild(legend);
                    setLisaLegend(legend);
                } else if (!showSpatialClusters && lisaLegend) {
                    lisaLegend.remove();
                    setLisaLegend(null);
                }
            } catch (error) {
                console.error('Error updating clusters visibility:', error);
            }
        }
    }, [showSpatialClusters, layersInitialized, toggleLayerSet, stateLisaLayers]);

    // UseEffect to handle focused state/county
    useEffect(() => {
        // if (!map.current || !layersInitialized || !geoData) return;
        if (!isMapInteractive) {
            return;
          }

        // 2. Handle city focus
        if (focus.type === 'city' && focus.city) {
            // Fly to the city
            const { name, state, coordinates } = focus.city;
            console.log('Focusing on city:', focus.city);

            map.current.flyTo({
                center: coordinates,
                zoom: 10,
                duration: 2000
            });
            // Clear state highlights
            map.current.setPaintProperty('state-borders', 'line-opacity', 0);
            // Clear county highlights
            map.current.setPaintProperty('county-borders', 'line-opacity', 0);
            map.current.setPaintProperty('county-choropleth', 'fill-opacity', 0);
            //Turn on state choropleth
            toggleLayerVisibility('state-choropleth', true);
            toggleLayerVisibility('state-borders', true);

            // Update announcement
            setStateAnnouncement(`Now focused on ${name}, ${state}`);

            return;
        }
        
        // 4. Handle county focus
        // TODO: why using if here instead of else if?
        else if (focus.type === 'county' && focus.county) {
            // Hide state layers
            toggleLayerSet(stateLayers, false);
            // Make sure we have a valid state in the states array
            const stateName = focus.states && focus.states.length > 0 ? focus.states[0] : null;
            const countyName = focus.county;
            
            // Check if we already have county data for this state and if the map has the county layers
            const hasCountyData = countyData && sourceExists('counties');
            
            if (hasCountyData) {
                // We already have county data, just highlight the focused county
                const countyFeature = countyData.features.find(
                    f => f.properties.county_name.toLowerCase() === countyName.toLowerCase()
                );

                if (countyFeature) {
                    // Only highlight the county without changing map position
                    map.current.setPaintProperty('county-borders', 'line-color', [
                        'case',
                        ['==', ['downcase', ['get', 'county_name']], countyName.toLowerCase()],
                        '#000',  // highlight color
                        '#fff'   // normal color
                    ]);
                    map.current.setPaintProperty('county-borders', 'line-width', [
                        'case',
                        ['==', ['downcase', ['get', 'county_name']], countyName.toLowerCase()],
                        2,
                        0
                    ]);

                    // Update announcement
                    setStateAnnouncement(`Now focused on ${countyName}, ${stateName}`);
                }
            } else {
                // We need to fetch county data
                fetchCountyData(stateName).then((countyGeoJson) => {
                    // Store the county data for future use
                    setCountyData(countyGeoJson);
                    
                    // Remove existing county layers
                    removeLayersSafely(countyLayers);
                    removeSourceSafely('counties');

                    // Add new county source and layers without changing map position
                    map.current.addSource('counties', {
                        type: 'geojson',
                        data: countyGeoJson
                    });

                    // Create layers
                    const dataset = datasets[selectedDataset];
                    map.current.addLayer({
                        id: 'county-choropleth',
                        type: 'fill',
                        source: 'counties',
                        paint: {
                            'fill-color': [
                                'interpolate',
                                ['linear'],
                                ['get', 'value'],
                                ...dataset.breaks.flatMap((break_, i) => [
                                    break_,
                                    dataset.colors[i]
                                ])
                            ],
                            'fill-opacity': 0.75
                        }
                    });

                    // Add county borders layer
                    map.current.addLayer({
                        id: 'county-borders',
                        type: 'line',
                        source: 'counties', 
                        layout: {
                            'visibility': 'visible'
                        },
                        paint: {
                            'line-color': '#000',
                            'line-width': 1,
                            'line-opacity': 0.7
                        }
                    });

                    // Find and highlight the county without changing map position
                    const countyFeature = countyGeoJson.features.find(
                        f => f.properties.county_name.toLowerCase() === countyName.toLowerCase()
                    );

                    if (countyFeature) {
                        // Only highlight the county
                        map.current.setPaintProperty('county-borders', 'line-color', [
                            'case',
                            ['==', ['downcase', ['get', 'county_name']], countyName.toLowerCase()],
                            '#000',  // highlight color
                            '#fff'   // normal color
                        ]);
                        map.current.setPaintProperty('county-borders', 'line-width', [
                            'case',
                            ['==', ['downcase', ['get', 'county_name']], countyName.toLowerCase()],
                            2,
                            0.5
                        ]); 

                        // Update announcement
                        setStateAnnouncement(`Now focused on ${countyName}, ${stateName}`);
                    }
                });
            }
        }
        
        // 5. Handle state focus
        else if (focus.type === 'state' || focus.type === 'compare') {
            console.log('Focusing on state:', focus.states);
            // Show state map if it was hidden
            toggleLayerVisibility('state-choropleth', true);
            toggleLayerVisibility('state-borders', true);
            
            // If for some reason no states array is present, just reset
            if (!focus.states || focus.states.length === 0) {
                map.current.flyTo({
                    center: [-96, 37.8],
                    zoom: 4,
                    duration: 2000
                });
                return;
            }
            
            // Gather the features for these states
            const features = focus.states.map(stateName => {
                return geoData.features.find(f =>
                f.properties.state_name.toLowerCase() === stateName.toLowerCase()
                );
            }).filter(Boolean);

             // If we found at least one matching feature, fit bounds and highlight them
            if (features.length > 0) {
                const bounds = new mapboxgl.LngLatBounds();
                features.forEach(feature => {
                if (feature.geometry.coordinates) {
                    const coords = (feature.geometry.type === 'Polygon')
                    ? feature.geometry.coordinates[0]
                    : feature.geometry.coordinates.flat(1);
                    coords.forEach(coord => bounds.extend(coord));
                }
                });
        
                map.current.fitBounds(bounds, {
                padding: 100,
                duration: 2000,
                maxZoom: 7
                });
        
                // Create a case-insensitive filter for all focused states
                const stateFilter = [
                'in',
                ['downcase', ['get', 'state_name']],
                ['literal', focus.states.map(s => s.toLowerCase())]
                ];
        
                // Highlight only the desired states
                map.current.setPaintProperty('state-borders', 'line-opacity', [
                'case',
                stateFilter,
                1,
                0
                ]);
                map.current.setPaintProperty('state-borders', 'line-color', '#000');
                map.current.setPaintProperty('state-borders', 'line-width', 2);
        
                // Set a spoken announcement, depending on compare vs. single state
                if (focus.states.length > 1) {
                setStateAnnouncement(`Now comparing ${focus.states.join(' and ')}`);
                } else {
                setStateAnnouncement(`Now focused on ${focus.states[0]} state`);
                }
            } else {
                // If no matching features, just reset (fallback)
                map.current.flyTo({
                center: [-96, 37.8],
                zoom: 4,
                duration: 2000
                });
            }
        }
    }, [
        focus, 
        layersInitialized, 
        geoData, 
        countyData, 
        datasets, 
        selectedDataset, 
        toggleLayerVisibility, 
        removeLayersSafely, 
        removeSourceSafely, 
        sourceExists, 
        countyLayers
    ]);

    // Update mousemove handlers to handle county-level data properly
    useEffect(() => {
        if (map.current && layersInitialized) {
            // Remove existing mousemove handlers
            map.current.off('mousemove', 'state-choropleth');
            map.current.off('mousemove', 'state-borders');
            map.current.off('mousemove', 'state-base');
            if (showingCounties) {
                map.current.off('mousemove', 'county-choropleth');
                map.current.off('mousemove', 'county-borders');
            }
            
            // Add mousemove handler for states - only active when not showing counties
            if (!showingCounties) {
                map.current.on('mousemove', 'state-choropleth', (e) => {
                    if (e.features.length > 0) {
                        map.current.getCanvas().style.cursor = 'pointer';
                        
                        const feature = e.features[0];
                        const stateName = feature.properties.state_name;
                        
                        // Format tooltip content based on dataset
                        let tooltipContent;
                        
                            // For other pages, show the current dataset value
                            const value = feature.properties.value;
                            
                            // Format value based on current dataset
                            let formattedValue;
                            if (selectedDataset === 'ppl_densit') {
                                formattedValue = `${value.toFixed(2)} people per square mile`;
                            } else if (selectedDataset === 'gas') {
                                formattedValue = `${value} households with gas heating`;
                            } else {
                                formattedValue = `${value.toFixed(2)}%`;
                            }
                            
                            tooltipContent = `
                                <div class="text-xs font-semibold">${stateName}</div>
                            <div class="text-xs">${formattedValue}</div>
                        `;

                        const coordinates = e.lngLat;

                        popup.current
                            .setLngLat(coordinates)
                            .setHTML(tooltipContent)
                            .addTo(map.current);
                    }
                });

                // Add mousemove handler for state borders
                map.current.on('mousemove', 'state-borders', (e) => {
                    if (e.features.length > 0) {
                        map.current.getCanvas().style.cursor = 'pointer';
                        
                        const feature = e.features[0];
                        const stateName = feature.properties.state_name;
                        
                        // Format tooltip content based on dataset
                        let tooltipContent;

                        // For other pages, show the current dataset value
                        const value = feature.properties.value;
                            
                        tooltipContent = `
                            <div class="text-xs font-semibold">${stateName}</div>
                            <div class="text-xs">${value ? value.toFixed(2) : 'N/A'}</div>
                        `;
                        const coordinates = e.lngLat;
                        
                        popup.current
                            .setLngLat(coordinates)
                            .setHTML(tooltipContent)
                            .addTo(map.current);
                    }
                });
                
                // Add mouseleave handler for state borders
                map.current.on('mouseleave', 'state-borders', () => {
                    map.current.getCanvas().style.cursor = '';
                    popup.current.remove();
                });
                
                // Add mousemove handler for state hover layer
                if (map.current.getLayer('state-base')) {
                    map.current.on('mousemove', 'state-base', (e) => {
                        if (e.features.length > 0) {
                            map.current.getCanvas().style.cursor = 'pointer';
                            
                            const feature = e.features[0];
                            const stateName = feature.properties.state_name;
                            
                            // Format tooltip content based on dataset
                            let tooltipContent;
                            
                            // For other pages, show the current dataset value
                            const value = feature.properties.value;
                            
                            tooltipContent = `
                                <div class="text-xs font-semibold">${stateName}</div>
                                <div class="text-xs">${value ? value.toFixed(2) : 'N/A'}</div>
                            `;

                            const coordinates = e.lngLat;
                            
                            popup.current
                                .setLngLat(coordinates)
                                .setHTML(tooltipContent)
                                .addTo(map.current);
                        }
                    });
                    
                    // Add mouseleave handler for state hover layer
                    map.current.on('mouseleave', 'state-base', () => {
                        map.current.getCanvas().style.cursor = '';
                        popup.current.remove();
                    });
                }
                
                // Add mouseleave handler for population density
                map.current.on('mouseleave', 'state-choropleth', () => {
                    map.current.getCanvas().style.cursor = '';
                    popup.current.remove();
                });
            }
            
            // Add mousemove handler for county fills
            if (showingCounties) {
                map.current.on('mousemove', 'county-choropleth', (e) => {
                    if (e.features.length > 0) {
                        map.current.getCanvas().style.cursor = 'pointer';
                        
                        const feature = e.features[0];
                        const countyName = feature.properties.county_name;
                        const stateName = feature.properties.state_name;
                        
                        // Format tooltip content based on dataset
                        let tooltipContent;
                        
                            // For other pages, show the current dataset value
                            const value = feature.properties.value;
                            
                            tooltipContent = `
                                <div class="text-xs font-semibold">${countyName} County, ${stateName}</div>
                                <div class="text-xs">${value ? value.toFixed(2) : 'N/A'}</div>
                            `;
                        
                        const coordinates = e.lngLat;
                        
                        popup.current
                            .setLngLat(coordinates)
                            .setHTML(tooltipContent)
                            .addTo(map.current);
                    }
                });
                
                map.current.on('mouseleave', 'county-choropleth', () => {
                    map.current.getCanvas().style.cursor = '';
                    popup.current.remove();
                });
                
                // Keep the existing county-borders handler for completeness
                map.current.on('mousemove', 'county-borders', (e) => {
                    if (e.features.length > 0) {
                        map.current.getCanvas().style.cursor = 'pointer';
                        
                        const feature = e.features[0];
                        const countyName = feature.properties.county_name;
                        const stateName = feature.properties.state_name;
                        
                        // Format tooltip content based on dataset
                        let tooltipContent;
                        
                        // For other pages, show the current dataset value
                        const value = feature.properties.value;
                        
                            tooltipContent = `
                                <div class="text-xs font-semibold">${countyName} County, ${stateName}</div>
                                <div class="text-xs">${value ? value.toFixed(2) : 'N/A'}</div>
                        `;
                        
                        const coordinates = e.lngLat;
                        
                        popup.current
                            .setLngLat(coordinates)
                            .setHTML(tooltipContent)
                            .addTo(map.current);
                    }
                });
                
                map.current.on('mouseleave', 'county-borders', () => {
                    map.current.getCanvas().style.cursor = '';
                    popup.current.remove();
                });
            }
        }
    }, [selectedDataset, layersInitialized, showingCounties]);

    const removeLisaLayer = () => {
        if (lisaLayer) {
            map.current.removeLayer(lisaLayer);
            setLisaLayer(null);
            setLisaLegend(null);
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

    // Add new useEffect for accessibility
    useEffect(() => {
        if(!isMapInteractive) {
            return;
        }
        if (map.current) {
            map.current.on('load', () => {
                // Hide all mapbox controls from screen readers
                const elementsToHide = document.querySelectorAll(`
                    .mapboxgl-ctrl-attrib a, 
                    .mapboxgl-ctrl-logo,
                    .mapboxgl-ctrl-group button,
                    .mapboxgl-ctrl-fullscreen,
                    .mapboxgl-ctrl-geolocate,
                    .mapboxgl-ctrl-scale,
                    .mapboxgl-ctrl-compass,
                    .mapboxgl-ctrl-zoom-in,
                    .mapboxgl-ctrl-zoom-out
                `);

                elementsToHide.forEach(element => {
                    element.setAttribute('tabindex', '-1');
                    element.setAttribute('aria-hidden', 'true');
                    element.setAttribute('role', 'presentation');
                });

                // Also hide the container elements
                const containers = document.querySelectorAll(`
                    .mapboxgl-control-container,
                    .mapboxgl-ctrl-top-right,
                    .mapboxgl-ctrl-top-left,
                    .mapboxgl-ctrl-bottom-right,
                    .mapboxgl-ctrl-bottom-left
                `);

                containers.forEach(container => {
                    container.setAttribute('aria-hidden', 'true');
                    container.setAttribute('role', 'presentation');
                });
            });
        }
    }, [map.current]);

    // Add this helper function at the top level of the component
    const normalizeStateName = (state) => {
        if (Array.isArray(state)) {
            return state[0];  // Take first state if array
        }
        return state;
    };

    // Find adjacent states
    const findAdjacentStates = useCallback((stateName) => {
        if (!geoData) return null;

        // Normalize state name input
        stateName = normalizeStateName(stateName);
        
        const currentState = geoData.features.find(
            f => f.properties.state_name.toLowerCase() === stateName.toLowerCase()
        );
        if (!currentState) return null;

        // Get neighbors from properties
        const neighbors = currentState.properties.neighbors_;
        if (!Array.isArray(neighbors)) {
            console.error('Invalid neighbors data for', stateName);
            return {
                north: null,
                south: null,
                west: null,
                east: null
            };
        }

        // Create adjacency object from neighbors array
        // neighbors_ array is ordered as [north, south, east, west]
        const adjacentStates = {
            north: neighbors[0] || null,
            south: neighbors[1] || null,
            west: neighbors[2] || null,
            east: neighbors[3] || null
        };

        return adjacentStates;
    }, [geoData]);

    // Add effect to update the focused state highlight
    useEffect(() => {
        if (map.current && layersInitialized && focus?.type) {
            // Create a filter for the current focused state
            const focusFilter = ['==', 
                ['get', 'state_name'], 
                focus.states?.[0] || ''
            ];

            // Update the state borders layer to highlight only the focused state
            map.current.setPaintProperty('state-borders', 'line-opacity', [
                'case',
                focusFilter,
                1,
                0
            ]);
            map.current.setPaintProperty('state-borders', 'line-color', '#3b4252');
            map.current.setPaintProperty('state-borders', 'line-width', 2);
            map.current.setLayoutProperty('state-borders', 'line-cap', 'round');
        } else if (map.current && layersInitialized) {
            // Reset the highlight when no state is focused
            map.current.setPaintProperty('state-borders', 'line-opacity', 0);
            map.current.setPaintProperty('state-borders', 'line-color', '#ccc');
            map.current.setLayoutProperty('state-borders', 'line-cap', 'butt');
        }
    }, [focus, layersInitialized]);

    // Add effect to clear county focus when state changes
    useEffect(() => {
        if (focus?.type === 'state' && focus?.county) {
            onFocusChange({
                ...focus,
                type: null,
                county: null,
                city: null,
                highlightOnly: false
            });
        }
    }, [focus, onFocusChange]);

    // Update focusStateOnMap to clear county focus
    const focusStateOnMap = useCallback((stateName) => {
        if (!map.current || !geoData) return;

        // If stateName is an array, fit the view to include all states
        if (Array.isArray(stateName)) {
            // Get features for all states
            const features = stateName.map(state => {
                return geoData.features.find(f => 
                    f.properties.state_name.toLowerCase() === state.toLowerCase()
                );
            }).filter(Boolean); // Remove any undefined features

            if (features.length > 0) {
                try {
                    // Calculate bounds that include all states
                    const bounds = new mapboxgl.LngLatBounds();
                    
                    features.forEach(feature => {
                        if (feature.geometry && feature.geometry.coordinates) {
                            if (feature.geometry.type === 'Polygon') {
                                // For Polygon, get the outer ring coordinates
                                feature.geometry.coordinates[0].forEach(coord => {
                                    if (Array.isArray(coord) && coord.length >= 2 && 
                                        !isNaN(coord[0]) && !isNaN(coord[1])) {
                                        bounds.extend(coord);
                                    }
                                });
                            } else if (feature.geometry.type === 'MultiPolygon') {
                                // For MultiPolygon, iterate through each polygon
                                feature.geometry.coordinates.forEach(polygon => {
                                    // Get the outer ring of each polygon
                                    polygon[0].forEach(coord => {
                                        if (Array.isArray(coord) && coord.length >= 2 && 
                                            !isNaN(coord[0]) && !isNaN(coord[1])) {
                                            bounds.extend(coord);
                                        }
                                    });
                                });
                            }
                        }
                    });

                    // Only fit bounds if we have valid coordinates
                    if (!bounds.isEmpty()) {
                        map.current.fitBounds(bounds, {
                            padding: 100,
                            duration: 1000,
                            maxZoom: 5
                        });
                    } else {
                        console.warn('No valid coordinates found for bounds');
                    }
                } catch (error) {
                    console.error('Error setting bounds:', error);
                }
            }
        } else {
            // Original single-state focus logic
            const feature = geoData.features.find(f => 
                f.properties.state_name.toLowerCase() === stateName.toLowerCase()
            );

            if (feature && feature.geometry) {
                try {
                    const bounds = new mapboxgl.LngLatBounds();
                    
                    if (feature.geometry.type === 'Polygon') {
                        // For Polygon, get the outer ring coordinates
                        feature.geometry.coordinates[0].forEach(coord => {
                            if (Array.isArray(coord) && coord.length >= 2 && 
                                !isNaN(coord[0]) && !isNaN(coord[1])) {
                                bounds.extend(coord);
                            }
                        });
                    } else if (feature.geometry.type === 'MultiPolygon') {
                        // For MultiPolygon, iterate through each polygon
                        feature.geometry.coordinates.forEach(polygon => {
                            // Get the outer ring of each polygon
                            polygon[0].forEach(coord => {
                                if (Array.isArray(coord) && coord.length >= 2 && 
                                    !isNaN(coord[0]) && !isNaN(coord[1])) {
                                    bounds.extend(coord);
                                }
                            });
                        });
                    }

                    // Only fit bounds if we have valid coordinates
                    if (!bounds.isEmpty()) {
                        map.current.fitBounds(bounds, {
                            padding: 100,
                            duration: 1000,
                            maxZoom: 5
                        });
                    } else {
                        console.warn('No valid coordinates found for bounds');
                    }
                } catch (error) {
                    console.error('Error setting bounds:', error);
                }
            }
        }
    }, [geoData]);

    // Update fetchCountyData to handle array input
    const fetchCountyData = async (stateName) => {
        try {
            setIsLoading(true);
            console.log('Fetching county data for:', stateName);
            
            const response = await fetch(`${apiUrl}/api/counties/${stateName}`, {
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
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Received county data:', data);

            if (!data.features || data.features.length === 0) {
                throw new Error('No county features found in response');
            }

            return data;
        } catch (error) {
            console.error('Error fetching county data:', error);
            setStateAnnouncement('Failed to load county data');
            throw error;
        } finally {
            setIsLoading(false);
        }
    };
    
    // Function to find adjacent counties using neighbors data
    const findAdjacentCounties = useCallback((countyName) => {
        if (!countyData) return null;

        const currentCounty = countyData.features.find(
            f => f.properties.county_name.toLowerCase() === countyName.toLowerCase()
        );
        if (!currentCounty) return null;

        // Get neighbors from properties
        const neighbors = currentCounty.properties.neighbors_;
        if (!Array.isArray(neighbors)) {
            console.error('Invalid neighbors data for county:', countyName);
            return {
                north: null,
                south: null,
                west: null,
                east: null
            };
        }

        // Create adjacency object from neighbors array
        // neighbors_ array is ordered as [north, south, west, east]
        const adjacentCounties = {
            north: neighbors[0] || null,
            south: neighbors[1] || null,
            west: neighbors[2] || null,
            east: neighbors[3] || null
        };

        return adjacentCounties;
    }, [countyData]);

    // Helper function to focus the map on a county
    const focusCountyOnMap = useCallback((countyName) => {
        const feature = countyData?.features.find(f => 
            f.properties.county_name.toLowerCase() === countyName.toLowerCase()
        );
        if (feature && map.current) {
            // Only update the highlighting, no bounds adjustment
            if (map.current.getLayer('county-borders')) {
                map.current.setPaintProperty('county-borders', 'line-color', [
                    'case',
                    ['==', ['get', 'county_name'], countyName],
                    '#000',
                    '#37474f'
                ]);
                map.current.setPaintProperty('county-borders', 'line-width', [
                    'case',
                    ['==', ['get', 'county_name'], countyName],
                    3,
                    0
                ]);
            }
        }
    }, [countyData]);

    // Keep the keyboard navigation effect
    useEffect(() => {
        if(!isMapInteractive) {
            return;
        }
        const handleKeyDown = (e) => {
            if (!isMapInteractive) return;

            // Handle initial focus
            if (e.key === 'Tab') {
                e.preventDefault();
                if (!focus.type) {
                    onFocusChange({
                        type: 'state',
                        states: ['Kansas'],
                        county: null,
                        city: null,
                        highlightOnly: false
                    });
                    setStateAnnouncement('Now focused on Kansas state');
                    focusStateOnMap('Kansas');
                } else if (focus.type === 'city') {
                    // When focused on a city, Tab should focus on the containing state
                    if (focus.city && focus.city.state) {
                        onFocusChange({
                            type: 'state',
                            states: [focus.city.state],
                            county: null,
                            city: null,
                            highlightOnly: false
                        });
                        setStateAnnouncement(`Now focused on ${focus.city.state} state`);
                        focusStateOnMap(focus.city.state);
                    }
                } else if (showingCounties && !focus.county) {
                    const firstCounty = countyData?.features[0]?.properties.county_name;
                    if (firstCounty) {
                        onFocusChange({
                            ...focus,
                            type: 'county',
                            county: firstCounty
                        });
                        setStateAnnouncement(`Now focused on ${firstCounty} county`);
                        focusCountyOnMap(firstCounty);
                    }
                }
            }

            // Handle arrow key navigation
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
                
                // If we're focused on a city, show message to press Tab first
                if (focus.type === 'city') {
                    setStateAnnouncement('Press Tab to focus on a state before using arrow keys');
                    return;
                }
                
                const normalizedState = normalizeStateName(focus.states[0]);
                if (!normalizedState || (focus.type === 'county' && !focus.county)) {
                    setStateAnnouncement('Press Tab to focus on a state before using arrow keys');
                    return;
                }

                const direction = {
                    'ArrowUp': 'north',
                    'ArrowDown': 'south',
                    'ArrowLeft': 'west',
                    'ArrowRight': 'east'
                }[e.key];

                if (focus.type === 'county' && focus.county) {
                    // County-level navigation
                    const adjacentCounties = findAdjacentCounties(focus.county);
                    const nextCounty = adjacentCounties?.[direction];

                    if (nextCounty) {
                        onFocusChange({
                            ...focus,
                            county: nextCounty
                        });
                        setStateAnnouncement(`Now focused on ${nextCounty} county`);
                        focusCountyOnMap(nextCounty);
                    } else {
                        setStateAnnouncement(
                            `There is no county ${direction} of ${focus.county}`
                        );
                    }
                } else {
                    // State-level navigation
                    const adjacentStates = findAdjacentStates(normalizedState);
                    const nextState = adjacentStates?.[direction];

                    if (nextState) {
                        onFocusChange({
                            type: 'state',
                            states: [nextState],
                            county: null,
                            city: null,
                            highlightOnly: false
                        });
                        setStateAnnouncement(`Now focused on ${nextState} state`);
                        focusStateOnMap(nextState);
                    } else {
                        setStateAnnouncement(
                            `There is no state ${direction} of ${normalizedState}`
                        );
                    }
                }
            }

            // Handle zoom in to counties
            if ((e.key === '=' || e.key === '+') && focus.states[0]) {
                e.preventDefault();
                if (focus.type === 'state' && !showingCounties) {
                    fetchCountyData(focus.states[0]).then(data => {
                        setCountyData(data);
                        // Add county source and layers after data is fetched
                        if (map.current) {
                            // Add county source
                            if (!sourceExists('counties')) {
                                map.current.addSource('counties', {
                                    type: 'geojson',
                                    data: data
                                });
                            } else {
                                map.current.getSource('counties').setData(data);
                            }

                            // Add county choropleth layer
                            if (!layerExists('county-choropleth')) {
                                map.current.addLayer({
                                    id: 'county-choropleth',
                                    type: 'fill',
                                    source: 'counties',
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
                            }

                            // Add county borders layer
                            if (!layerExists('county-borders')) {
                                map.current.addLayer({
                                    id: 'county-borders',
                                    type: 'line',
                                    source: 'counties',
                                    paint: {
                                        'line-color': '#fff',
                                        'line-width': 0.5,
                                        'line-opacity': 0.7
                                    }
                                });
                            }

                            // Hide state choropleth
                            toggleLayerVisibility('state-choropleth', false);
                        }

                        onShowingCountiesChange(true);
                        setStateAnnouncement(`Showing counties in ${focus.states[0]}. Press Tab to focus on a county.`);
                    }).catch(error => {
                        console.error('Error loading county data:', error);
                        setStateAnnouncement('Failed to load county data');
                    });
                }
            }

            // Handle zoom out from counties
            if (e.key === '-' && showingCounties) {
                e.preventDefault();
                onShowingCountiesChange(false);
                setCountyData(null);
                
                if (focus.type === 'county') {
                    onFocusChange({
                        type: 'state',
                        states: [focus.states[0]],
                        county: null,
                        city: null,
                        highlightOnly: false
                    });
                }
                
                // Clean up county layers
                if (map.current) {
                    removeLayersSafely(countyLayers);
                    removeSourceSafely('counties');

                    // show state-level choropleth
                    toggleLayerVisibility('state-choropleth', true);
                    
                    // Show state-level LISA clusters again if they were visible
                    if (showSpatialClusters) {
                        toggleLayerSet(stateLisaLayers, true);
                    }
                }
                
                focusStateOnMap(focus.states[0]);
                setStateAnnouncement(`Returned to state view of ${focus.states[0]}`);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        isMapInteractive,
        focus,
        showingCounties,
        countyData,
        findAdjacentStates,
        findAdjacentCounties,
        focusStateOnMap,
        focusCountyOnMap,
        onFocusChange,
        normalizeStateName,
        fetchCountyData,
        showSpatialClusters,
        onShowingCountiesChange,
        toggleLayerVisibility,
        toggleLayerSet,
        countyLayers,
        countyLisaLayers,
        removeLayersSafely,
        removeSourceSafely
    ]);

    // Update announcement effect
    // consider moving this to App.js
    useEffect(() => {
        setStateAnnouncement(
            isMapInteractive 
                ? focus?.county
                    ? `Map interaction enabled. Focused on ${focus.county} county in ${focus.states?.[0]} state.`
                    : focus?.states?.length > 0
                        ? `Map interaction enabled. Focused on ${focus.states[0]} state.`
                        : 'Map interaction enabled. Press Tab to focus on a state.'
                : 'Chat interaction enabled. Type a question to ask MappieTalkie.'
        );
    }, [isMapInteractive, focus]);

    // Update map interaction logging
    useEffect(() => {
        if (map.current) {
            // Store map viewport in window for access by other components
            window.mapZoomLevel = map.current.getZoom();
            window.mapCenter = map.current.getCenter();
            window.mapBounds = map.current.getBounds();
            
            // Set up event listeners for map interactions
            map.current.on('zoomend', () => {
                try {
                    window.mapZoomLevel = map.current.getZoom();
                    window.mapCenter = map.current.getCenter();
                    window.mapBounds = map.current.getBounds();
                    
                    // Log the map interaction
                    logMapInteraction(
                        'zoom', 
                        {
                            zoom: map.current.getZoom(),
                            center: map.current.getCenter(),
                            bounds: map.current.getBounds()
                        },
                        focus.states[0],
                        focus.county,
                        'map'
                    ).catch(err => console.error('Failed to log map interaction:', err));
                } catch (error) {
                    console.error('Error in zoom event handler:', error);
                }
            });
            
            map.current.on('moveend', () => {
                window.mapZoomLevel = map.current.getZoom();
                window.mapCenter = map.current.getCenter();
                window.mapBounds = map.current.getBounds();
                
                // Log the map interaction if it's not from a zoom
                if (!map.current._zooming) {
                    logMapInteraction(
                        'pan', 
                        {
                            zoom: map.current.getZoom(),
                            center: map.current.getCenter(),
                            bounds: map.current.getBounds()
                        },
                        focus.states[0],
                        focus.county,
                        'map'
                    );
                }
            });
        }
    }, [map.current]);

    // Add this useEffect to sync the local state with the prop
    useEffect(() => {
        setSelectedDataset(dataset);
    }, [dataset]);

    // Add this to the useEffect that handles showSpatialClusters changes
    useEffect(() => {
        if (!map.current || !geoData) return;

            // original LISA clusters logic
            if (showSpatialClusters) {
                // Show LISA clusters
                map.current.setLayoutProperty('state-lisa-clusters-fill', 'visibility', 'visible');
                map.current.setLayoutProperty('state-lisa-clusters-border', 'visibility', 'visible');
            } else {
                // Hide LISA clusters
                map.current.setLayoutProperty('state-lisa-clusters-fill', 'visibility', 'none');
                map.current.setLayoutProperty('state-lisa-clusters-border', 'visibility', 'none');
                
                // Reset state borders
                if (!focus.type) {
                    map.current.setPaintProperty('state-borders', 'line-opacity', 0);
                    map.current.setPaintProperty('state-borders', 'line-width', 1);
                }
            }
        
    }, [showSpatialClusters, geoData, focus]);

    // Update the effect that handles LISA clusters for counties vs states
    useEffect(() => {
        if (!map.current || !layersInitialized) return;
        
        if (showSpatialClusters) {
            // If we're showing counties, we need to fetch county-level LISA clusters
            if (focus.type === 'county' && focus.county) {
                // Hide state-level LISA clusters
                toggleLayerSet(stateLisaLayers, false);
                
                // Fetch county-level LISA clusters
                fetch(`${apiUrl}/api/lisa_clusters/${focus.states[0]}?dataset=${selectedDataset}&level=county`)
                    .then(response => response.json())
                    .then(data => {
                        // Update county source with LISA classifications
                        if (sourceExists('counties')) {
                            map.current.getSource('counties').setData(data);
                            
                            // Add county LISA cluster layers if they don't exist
                            if (!layerExists('county-lisa-clusters-fill')) {
                                map.current.addLayer({
                                    id: 'county-lisa-clusters-fill',
                                    type: 'fill',
                                    source: 'counties',
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
                                
                                map.current.addLayer({
                                    id: 'county-lisa-clusters-border',
                                    type: 'line',
                                    source: 'counties',
                                    paint: {
                                        'line-color': [
                                            'match',
                                            ['get', 'lisa_class'],
                                            'LL', '#01579b',
                                            'HL', '#f06292',
                                            'LH', '#00bcd4',
                                            'HH', '#d81b60',
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
                            } else {
                                // Show existing county LISA layers
                                toggleLayerSet(countyLisaLayers, true);
                            }
                        }
                    })
                    .catch(error => console.error('Error fetching county LISA clusters:', error));
            } else {
                // Show state LISA clusters at state level
                toggleLayerSet(stateLisaLayers, true);
                
                // Hide county LISA clusters if they exist
                toggleLayerSet(countyLisaLayers, false);
            }
        } else {
            // Hide all LISA clusters
            toggleLayerSet(stateLisaLayers, false);
            toggleLayerSet(countyLisaLayers, false);
        }
    }, [
        showSpatialClusters, 
        showingCounties, 
        focus, 
        selectedDataset, 
        layersInitialized, 
        apiUrl, 
        toggleLayerSet, 
        stateLisaLayers, 
        countyLisaLayers, 
        layerExists, 
        sourceExists
    ]);

    return (
        <div className="relative h-full ">
            <div 
                ref={mapContainer} 
                className="h-full" 
                role="application"
                aria-label="Interactive map of United States"
                tabIndex="0"
                onClick={() => {
                    // Only change focus if it's not already on map
                    if (!isMapInteractive) {
                        onMapClick();
                    }
                }}
            />

            {/* Live region for announcements */}
            <div
                ref={announcementRef}
                role="status"
                aria-live="assertive"
                aria-atomic="true"
                className="sr-only"
            >
                {stateAnnouncement}
            </div>

            {/* Current focused state display and announcements */}
            {(focus.type || stateAnnouncement) && (
                <div 
                    id="map-interaction-announcement"
                    className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white p-4 rounded-lg shadow-lg"
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                >
                    {stateAnnouncement || `Now focused on ${focus.type ? focus.states[0] : ''} state`}
                </div>
            )}

            {/* Loading Dialog - Show when map is not initialized or layers not ready */}
            {(!map.current || !layersInitialized) && (
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
            <div className="absolute top-0 left-0 bg-white p-4 m-4 rounded-lg shadow-lg opacity-90" 
                tabIndex="-1">
                {/* Dataset Selector */}
                    <div className="mb-4">
                        <h3 className="text-sm font-bold mb-2">Dataset</h3>
                        <div className="space-y-2">
                            {isTaskPage ? (
                                <>
                                    <label className="flex items-center">
                                        <input
                                            type="radio"
                                            value="pct_tot_co"
                                            checked={selectedDataset === "pct_tot_co"}
                                            onChange={(e) => {
                                                const newDataset = e.target.value;
                                                setSelectedDataset(newDataset);
                                                onDatasetChange(newDataset);
                                            }}
                                            className="mr-2 text-blue-500 focus:ring-blue-500"
                                        />
                                        <span className="text-sm">Underserved Population</span>
                                    </label>
                                    <label className="flex items-center">
                                        <input
                                            type="radio"
                                            value="pct_no_bb_"
                                            checked={selectedDataset === "pct_no_bb_"}
                                            onChange={(e) => {
                                                const newDataset = e.target.value;
                                                setSelectedDataset(newDataset);
                                                onDatasetChange(newDataset);
                                            }}
                                            className="mr-2 text-blue-500 focus:ring-blue-500"
                                        />
                                        <span className="text-sm">Lacking Broadband Access</span>
                                    </label>
                                </>
                            ) : (
                                <>
                                    <label className="flex items-center">
                                        <input
                                            type="radio"
                                            value="ppl_densit"
                                            checked={selectedDataset === "ppl_densit"}
                                            onChange={(e) => {
                                                const newDataset = e.target.value;
                                                setSelectedDataset(newDataset);
                                                onDatasetChange(newDataset);
                                            }}
                                            className="mr-2 text-blue-500 focus:ring-blue-500"
                                        />
                                        <span className="text-sm">Population Density</span>
                                    </label>
                                </>
                            )}
                        </div>
                    </div>
                
                {/* choropleth legend */}
                    <div className="flex flex-col gap-1">
                        {datasets[selectedDataset].breaks.map((value, i) => (
                            <div key={i} className="flex items-center">
                                <div 
                                    className="w-4 h-4 mr-2" 
                                    style={{ backgroundColor: datasets[selectedDataset].colors[i] }}
                                />
                                <span className="text-xs">
                                    {value}{i === datasets[selectedDataset].breaks.length - 1 ? '+' : ''}
                                    {selectedDataset === 'ppl_densit' || selectedDataset === 'gas' ? '' : '%'}
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
