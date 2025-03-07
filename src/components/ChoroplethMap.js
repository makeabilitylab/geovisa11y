import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import * as turf from '@turf/turf';
import { logMapInteraction } from '../utils/logger';
import { generateDotDensityForFeatureCollection, generateMultiAttributeDotDensity } from '../utils/DotDensityGenerator';

const ChoroplethMap = ({ dataset, showSpatialClusters, onSpatialClustersToggle, onDatasetChange, focusedState, focusedCity, onFocusedCountyChange, onStateFocus, apiUrl, isMapInteractive, onMapClick, isTaskPage = false, isTask2Page = false }) => {
    const mapContainer = useRef(null);
    const map = useRef(null);
    const popup = useRef(null);
    const [selectedDataset, setSelectedDataset] = useState(
        isTask2Page ? 'gas' : 
        isTaskPage ? 'pct_tot_co' : 
        'ppl_densit'
    );
    const [geoData, setGeoData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [lisaLayer, setLisaLayer] = useState(null);
    const [lisaLegend, setLisaLegend] = useState(null);
    const [layersInitialized, setLayersInitialized] = useState(false);
    const [currentFocusedState, setCurrentFocusedState] = useState(null);
    const [stateAnnouncement, setStateAnnouncement] = useState('');
    const announcementRef = useRef(null);
    const [showingCounties, setShowingCounties] = useState(false);
    const [countyData, setCountyData] = useState(null);
    const [currentFocusedCounty, setCurrentFocusedCounty] = useState(null);
    const [currentFocusedCity, setCurrentFocusedCity] = useState(null);
    const [dotDensityData, setDotDensityData] = useState(null);
    const [showPredominantFuelLegend, setShowPredominantFuelLegend] = useState(false);

    const datasets = isTask2Page ? {
        'gas': {
            name: 'Gas Heating Usage',
            breaks: [0, 1000, 2000, 3000, 4000, 5000],
            colors: ['#ffffcc', '#ffeda0', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c']
        }
    } : isTaskPage ? {
        'pct_tot_co': {
            name: 'Priority Population',
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
            colors: ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5']
        },
        'walk_to_wo': {
            name: 'Walking to Work',
            breaks: [1, 2, 3, 4, 5, 6],
            colors: ['#f7fcf5', '#e5f5e0', '#c7e9c0', '#a1d99b', '#74c476', '#41ab5d', '#238b45']
        },
        'transit_to': {
            name: 'Public Transit to Work',
            breaks: [1, 2, 3, 4, 5, 6],
            colors: ['#fff5f0', '#fee0d2', '#fcbba1', '#fc9272', '#fb6a4a', '#ef3b2c', '#cb181d']
        }
    };

    const fuelTypes = {
        gas: {
            name: 'Gas Heating',
            color: '#ff0000', // Red
            dotValue: 100000
        },
        electricity: {
            name: 'Electric Heating',
            color: '#0000ff', // Blue
            dotValue: 100000
        },
        oil: {
            name: 'Oil Heating',
            color: '#00aa00', // Green
            dotValue: 100000
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

    const fetchData = async () => {
        setIsLoading(true);
        try {
            // For Task2, use a special endpoint that returns all fuel types
            const endpoint = isTask2Page ? 'task2_state' : selectedDataset;
            
            const response = await fetch(`${apiUrl}/api/geojson/${endpoint}`, {
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
                const source = map.current.getSource('population');
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

            // Add geolocate control
            // map.current.addControl(
            //     new mapboxgl.GeolocateControl({
            //         positionOptions: { enableHighAccuracy: true },
            //         trackUserLocation: true
            //     }),
            //     'top-right'
            // );
            // Make geolocate control inaccessible to screen readers
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
            map.current.addSource('population', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: []
                }
            });

            // Add population density layer first (bottom layer)
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

            // Add LISA clusters layer next
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
                source: 'population',
                paint: {
                    'line-color': '#000',
                    'line-width': 1,
                    'line-opacity': isTask2Page ? 0.5 : 0 // Make borders visible by default for Task2
                },
                // Ensure this layer is always on top
                maxzoom: 24
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
            fetchData();

            // Add this after adding the population source
            if (isTask2Page && dotDensityData) {
                map.current.addSource('dot-density', {
                    type: 'geojson',
                    data: dotDensityData
                });
                
                if (map.current && map.current.loaded()) {
                    if (!map.current.getSource('dot-density')) {
                        map.current.addSource('dot-density', {
                            type: 'geojson',
                            data: dotDensityData
                        });
                    } else {
                        map.current.getSource('dot-density').setData(dotDensityData);
                    }
                    
                    if (!map.current.getLayer('dot-density-layer')) {
                        map.current.addLayer({
                            id: 'dot-density-layer',
                            type: 'circle',
                            source: 'dot-density',
                            paint: {
                                'circle-radius': 2,
                                'circle-color': ['get', 'color'], // Use the color property from each point
                                'circle-opacity': 0.8
                            },
                            filter: ['==', ['get', 'lisa_class'], 'HH']
                        }, 'state-borders');
                    } else {
                        console.log("Dot density layer already exists");
                    }
                } else {
                    console.log("Map not fully loaded yet, waiting...");
                }
            }

            // Set initial layer visibility based on page type
            if (isTask2Page) {
                map.current.setLayoutProperty('population-density', 'visibility', 'none');
            }

            // For Task2, add a transparent fill layer for better hover detection
            if (isTask2Page) {
                if (!map.current.getLayer('state-hover-layer')) {
                    map.current.addLayer({
                        id: 'state-hover-layer',
                        type: 'fill',
                        source: 'population',
                        paint: {
                            'fill-color': '#000000',
                            'fill-opacity': 0 // Completely transparent
                        }
                    });
                    
                    // Add mousemove handler for this special hover layer
                    map.current.on('mousemove', 'state-hover-layer', (e) => {
                        if (e.features.length > 0) {
                            map.current.getCanvas().style.cursor = 'pointer';
                            
                            const feature = e.features[0];
                            const stateName = feature.properties.state_name;
                            
                            // Use the actual gas, electricity, and oil values from the feature properties
                            const gas = feature.properties.gas || 0;
                            const electricity = feature.properties.electricity || 0;
                            const oil = feature.properties.oil || 0;
                            
                            const tooltipContent = `
                                <div class="text-xs font-semibold">${stateName}</div>
                                <div class="text-xs">Gas: ${gas.toLocaleString()} households</div>
                                <div class="text-xs">Electricity: ${electricity.toLocaleString()} households</div>
                                <div class="text-xs">Oil: ${oil.toLocaleString()} households</div>
                            `;
                            
                            const coordinates = e.lngLat;
                            
                            popup.current
                                .setLngLat(coordinates)
                                .setHTML(tooltipContent)
                                .addTo(map.current);
                        }
                    });
                    
                    map.current.on('mouseleave', 'state-hover-layer', () => {
                        map.current.getCanvas().style.cursor = '';
                        popup.current.remove();
                    });
                }
            }
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
                map.current.on('style.load', () => {
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
            fetchData();
        }
    }, [selectedDataset]);

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
            
            map.current.setPaintProperty('population-density', 'fill-color', expression);
            map.current.setPaintProperty('population-density', 'fill-opacity', 0.75);
        }
    }, [selectedDataset, geoData, layersInitialized]);

    // Update clusters visibility whenever showSpatialClusters changes
    useEffect(() => {
        if (map.current && layersInitialized) {
            try {
                const visibility = showSpatialClusters ? 'visible' : 'none';
                map.current.setLayoutProperty('lisa-clusters-fill', 'visibility', visibility);
                map.current.setLayoutProperty('lisa-clusters', 'visibility', visibility);
                
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
    }, [showSpatialClusters, layersInitialized]);

    // Update effect to handle focused state(s)
    useEffect(() => {
        if (map.current && layersInitialized && geoData) {
            if (focusedState === null && !focusedCity) {
                // Reset to default view
                setShowingCounties(false);
                setCurrentFocusedCounty(null);
                setCountyData(null);
                if (map.current) {
                    if (map.current.getLayer('county-borders')) {
                        map.current.removeLayer('county-borders');
                    }
                    if (map.current.getLayer('county-fills')) {
                        map.current.removeLayer('county-fills');
                    }
                    if (map.current.getSource('counties')) {
                        map.current.removeSource('counties');
                    }
                }

                map.current.flyTo({
                    center: [-96, 37.8],
                    zoom: 4,
                    duration: 2000
                });
                
                // Clear state highlights
                map.current.setPaintProperty('state-borders', 'line-opacity', 0);
                setStateAnnouncement('');
                setCurrentFocusedState(null);
                setCurrentFocusedCity(null);
            } else if (focusedCity) {
                // Handle city focus
                console.log('Focusing on city:', focusedCity);
                
                // Clean up any existing county layers
                if (showingCounties) {
                    setShowingCounties(false);
                    setCurrentFocusedCounty(null);
                    setCountyData(null);
                    if (map.current.getLayer('county-borders')) {
                        map.current.removeLayer('county-borders');
                    }
                    if (map.current.getLayer('county-fills')) {
                        map.current.removeLayer('county-fills');
                    }
                    if (map.current.getSource('counties')) {
                        map.current.removeSource('counties');
                    }
                }

                // Fly to city coordinates
                map.current.flyTo({
                    center: focusedCity.coordinates,
                    zoom: 10,
                    duration: 2000
                });

                // Update announcement
                setStateAnnouncement(`Now focused on ${focusedCity.name}, ${focusedCity.state}`);
                
                // Clear state highlights
                map.current.setPaintProperty('state-borders', 'line-opacity', 0);
                setCurrentFocusedState(null);
            } else {
                console.log('Focusing on states:', focusedState);
                
                // Handle both single state and array of states
                const statesToFocus = Array.isArray(focusedState) ? focusedState : [focusedState];
                
                // Update the current focused state and announcement
                setCurrentFocusedState(statesToFocus[0]); // Set to first state if multiple
                setStateAnnouncement(
                    statesToFocus.length > 1 
                        ? `Now comparing ${statesToFocus.join(' and ')}`
                        : `Now focused on ${statesToFocus[0]} state`
                );
                // Clean up any existing county layers before focusing on new state
                if (showingCounties) {
                    setShowingCounties(false);
                    setCurrentFocusedCounty(null);
                    setCountyData(null);
                    if (map.current.getLayer('county-borders')) {
                        map.current.removeLayer('county-borders');
                    }
                    if (map.current.getLayer('county-fills')) {
                        map.current.removeLayer('county-fills');
                    }
                    if (map.current.getSource('counties')) {
                        map.current.removeSource('counties');
                    }
                }

                // Rest of the focusing logic...
                const features = statesToFocus.map(state => 
                    geoData.features.find(f => 
                        f.properties.state_name.toLowerCase() === state.toLowerCase()
                    )
                ).filter(f => f);
                
                if (features.length > 0) {
                    // Calculate bounds that include all states
                    const bounds = new mapboxgl.LngLatBounds();
                    
                    features.forEach(feature => {
                        if (feature.geometry.coordinates) {
                            // Handle both Polygon and MultiPolygon
                            const coordinates = feature.geometry.type === 'Polygon' 
                                ? feature.geometry.coordinates[0]
                                : feature.geometry.coordinates.flat(1);
                            
                            coordinates.forEach(coord => {
                                bounds.extend(coord);
                            });
                        }
                    });
                    
                    // Zoom to include all states
                    map.current.fitBounds(bounds, {
                        padding: 100,
                        duration: 2000,
                        maxZoom: 5
                    });

                    // Create a case-insensitive filter for state names
                    const stateFilter = ['in', 
                        ['downcase', ['get', 'state_name']], 
                        ['literal', statesToFocus.map(state => state.toLowerCase())]
                    ];

                    // Highlight all focused states
                    map.current.setPaintProperty('state-borders', 'line-opacity', [
                        'case',
                        stateFilter,
                        1,
                        0
                    ]);
                    map.current.setPaintProperty('state-borders', 'line-color', '#000');
                    map.current.setPaintProperty('state-borders', 'line-width', 2);
                }
            }
        }
    }, [focusedState, focusedCity, geoData, layersInitialized]);

    // Update mousemove handlers to handle county-level data properly
    useEffect(() => {
        if (map.current && layersInitialized) {
            // Remove existing mousemove handlers
            map.current.off('mousemove', 'population-density');
            map.current.off('mousemove', 'state-borders');
            map.current.off('mousemove', 'state-hover-layer');
            if (showingCounties) {
                map.current.off('mousemove', 'county-fills');
                map.current.off('mousemove', 'county-borders');
            }
            
            // Add mousemove handler for states - only active when not showing counties
            if (!showingCounties) {
                map.current.on('mousemove', 'population-density', (e) => {
                    if (e.features.length > 0) {
                        console.log('Mousemove detected on population-density layer');
                        map.current.getCanvas().style.cursor = 'pointer';
                        
                        const feature = e.features[0];
                        const stateName = feature.properties.state_name;
                        
                        // Debug log the feature properties
                        console.log('Feature properties:', feature.properties);
                        
                        // Format tooltip content based on dataset
                        let tooltipContent;
                        
                        if (isTask2Page) {
                            // For Task2, show all fuel types
                            const gas = feature.properties.gas || 0;
                            const electricity = feature.properties.electricity || 0;
                            const oil = feature.properties.oil || 0;
                            
                            tooltipContent = `
                                <div class="text-xs font-semibold">${stateName}</div>
                                <div class="text-xs">Gas: ${gas.toLocaleString()} households</div>
                                <div class="text-xs">Electricity: ${electricity.toLocaleString()} households</div>
                                <div class="text-xs">Oil: ${oil.toLocaleString()} households</div>
                            `;
                        } else {
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
                        }

                        const coordinates = e.lngLat;
                        console.log('Setting popup at coordinates:', coordinates);

                        popup.current
                            .setLngLat(coordinates)
                            .setHTML(tooltipContent)
                            .addTo(map.current);
                    }
                });

                // Add mousemove handler for state borders
                map.current.on('mousemove', 'state-borders', (e) => {
                    if (e.features.length > 0) {
                        console.log('Mousemove detected on state-borders layer');
                        map.current.getCanvas().style.cursor = 'pointer';
                        
                        const feature = e.features[0];
                        const stateName = feature.properties.state_name;
                        
                        // Format tooltip content based on dataset
                        let tooltipContent;
                        
                        if (isTask2Page) {
                            // For Task2, show all fuel types
                            const gas = feature.properties.gas || 0;
                            const electricity = feature.properties.electricity || 0;
                            const oil = feature.properties.oil || 0;
                            
                            tooltipContent = `
                                <div class="text-xs font-semibold">${stateName}</div>
                                <div class="text-xs">Gas: ${gas.toLocaleString()} households</div>
                                <div class="text-xs">Electricity: ${electricity.toLocaleString()} households</div>
                                <div class="text-xs">Oil: ${oil.toLocaleString()} households</div>
                            `;
                        } else {
                            // For other pages, show the current dataset value
                            const value = feature.properties.value;
                            
                            tooltipContent = `
                                <div class="text-xs font-semibold">${stateName}</div>
                                <div class="text-xs">${value ? value.toFixed(2) : 'N/A'}</div>
                            `;
                        }

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
                if (map.current.getLayer('state-hover-layer')) {
                    map.current.on('mousemove', 'state-hover-layer', (e) => {
                        if (e.features.length > 0) {
                            console.log('Mousemove detected on state-hover-layer');
                            map.current.getCanvas().style.cursor = 'pointer';
                            
                            const feature = e.features[0];
                            const stateName = feature.properties.state_name;
                            
                            // Format tooltip content based on dataset
                            let tooltipContent;
                            
                            if (isTask2Page) {
                                // For Task2, show all fuel types
                                const gas = feature.properties.gas || 0;
                                const electricity = feature.properties.electricity || 0;
                                const oil = feature.properties.oil || 0;
                                
                                tooltipContent = `
                                    <div class="text-xs font-semibold">${stateName}</div>
                                    <div class="text-xs">Gas: ${gas.toLocaleString()} households</div>
                                    <div class="text-xs">Electricity: ${electricity.toLocaleString()} households</div>
                                    <div class="text-xs">Oil: ${oil.toLocaleString()} households</div>
                                `;
                            } else {
                                // For other pages, show the current dataset value
                                const value = feature.properties.value;
                                
                                tooltipContent = `
                                    <div class="text-xs font-semibold">${stateName}</div>
                                    <div class="text-xs">${value ? value.toFixed(2) : 'N/A'}</div>
                                `;
                            }

                            const coordinates = e.lngLat;
                            
                            popup.current
                                .setLngLat(coordinates)
                                .setHTML(tooltipContent)
                                .addTo(map.current);
                        }
                    });
                    
                    // Add mouseleave handler for state hover layer
                    map.current.on('mouseleave', 'state-hover-layer', () => {
                        map.current.getCanvas().style.cursor = '';
                        popup.current.remove();
                    });
                }
                
                // Add mouseleave handler for population density
                map.current.on('mouseleave', 'population-density', () => {
                    map.current.getCanvas().style.cursor = '';
                    popup.current.remove();
                });
            }
            
            // Add mousemove handler for county borders
            if (showingCounties) {
                map.current.on('mousemove', 'county-borders', (e) => {
                    if (e.features.length > 0) {
                        map.current.getCanvas().style.cursor = 'pointer';
                        
                        const feature = e.features[0];
                        const countyName = feature.properties.county_name;
                        const stateName = feature.properties.state_name;
                        
                        // Format tooltip content based on dataset
                        let tooltipContent;
                        
                        if (isTask2Page) {
                            // For Task2, show all fuel types at county level
                            const gas = feature.properties.gas || 0;
                            const electricity = feature.properties.electricity || 0;
                            const oil = feature.properties.oil || 0;
                            
                            tooltipContent = `
                                <div class="text-xs font-semibold">${countyName} County, ${stateName}</div>
                                <div class="text-xs">Gas: ${gas.toLocaleString()} households</div>
                                <div class="text-xs">Electricity: ${electricity.toLocaleString()} households</div>
                                <div class="text-xs">Oil: ${oil.toLocaleString()} households</div>
                            `;
                        } else {
                            // For other pages, show the current dataset value
                            const value = feature.properties.value;
                            
                            tooltipContent = `
                                <div class="text-xs font-semibold">${countyName} County, ${stateName}</div>
                                <div class="text-xs">${value ? value.toFixed(2) : 'N/A'}</div>
                            `;
                        }
                        
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
                
                // For Task2, also add handler for county fills if they exist
                if (isTask2Page && map.current.getLayer('county-fills')) {
                    map.current.on('mousemove', 'county-fills', (e) => {
                        if (e.features.length > 0) {
                            map.current.getCanvas().style.cursor = 'pointer';
                            
                            const feature = e.features[0];
                            const countyName = feature.properties.county_name;
                            const stateName = feature.properties.state_name;
                            
                            // Format tooltip content for Task2
                            const gas = feature.properties.gas || 0;
                            const electricity = feature.properties.electricity || 0;
                            const oil = feature.properties.oil || 0;
                            
                            const tooltipContent = `
                                <div class="text-xs font-semibold">${countyName} County, ${stateName}</div>
                                <div class="text-xs">Gas: ${gas.toLocaleString()} households</div>
                                <div class="text-xs">Electricity: ${electricity.toLocaleString()} households</div>
                                <div class="text-xs">Oil: ${oil.toLocaleString()} households</div>
                            `;
                            
                            const coordinates = e.lngLat;
                            
                            popup.current
                                .setLngLat(coordinates)
                                .setHTML(tooltipContent)
                                .addTo(map.current);
                        }
                    });
                    
                    map.current.on('mouseleave', 'county-fills', () => {
                        map.current.getCanvas().style.cursor = '';
                        popup.current.remove();
                    });
                }
            }
        }
    }, [selectedDataset, layersInitialized, showingCounties, isTask2Page]);

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

    // Debug layer code should stay
    useEffect(() => {
        // Debug function available in console
        window.debugMap = {
            addTestLayer: () => {
                if (map.current && map.current.isStyleLoaded()) {
                    // Add a simple rectangle
                    map.current.addSource('debug', {
                        type: 'geojson',
                        data: {
                            type: 'Polygon',
                            coordinates: [[
                                [-100, 40],
                                [-90, 40],
                                [-90, 35],
                                [-100, 35],
                                [-100, 40]
                            ]]
                        }
                    });

                    map.current.addLayer({
                        id: 'debug-layer',
                        type: 'fill',
                        source: 'debug',
                        paint: {
                            'fill-color': '#ff0000',
                            'fill-opacity': 0.5
                        }
                    });
                    
                    console.log('Debug layer added');
                } else {
                    console.log('Map not ready');
                }
            },
            getMapState: () => {
                if (map.current) {
                    return {
                        loaded: map.current.loaded(),
                        styleLoaded: map.current.isStyleLoaded(),
                        sources: Object.keys(map.current.getStyle().sources || {}),
                        layers: map.current.getStyle().layers?.map(l => l.id),
                        center: map.current.getCenter(),
                        zoom: map.current.getZoom()
                    };
                }
                return 'Map not initialized';
            }
        };
    }, []);

    // Add new useEffect for accessibility
    useEffect(() => {
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

    // Replace the existing findAdjacentStates function with this new version
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
        if (map.current && layersInitialized && currentFocusedState) {
            // Create a filter for the current focused state
            const focusFilter = ['==', 
                ['get', 'state_name'], 
                currentFocusedState
            ];

            // Update the state borders layer to highlight only the focused state
            map.current.setPaintProperty('state-borders', 'line-opacity', [
                'case',
                focusFilter,
                1,
                0
            ]);
            map.current.setPaintProperty('state-borders', 'line-color', '#000000');
            map.current.setPaintProperty('state-borders', 'line-width', 1);
            map.current.setLayoutProperty('state-borders', 'line-cap', 'round');
        } else if (map.current && layersInitialized) {
            // Reset the highlight when no state is focused
            map.current.setPaintProperty('state-borders', 'line-opacity', 0);
            map.current.setPaintProperty('state-borders', 'line-color', '#ccc');
            map.current.setLayoutProperty('state-borders', 'line-cap', 'butt');  // Reset to default
        }
    }, [currentFocusedState, layersInitialized]);

    // Add effect to clear county focus when state changes
    useEffect(() => {
        if (focusedState) {
            setCurrentFocusedCounty(null);
            onFocusedCountyChange(null);
        }
    }, [focusedState, onFocusedCountyChange]);

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
                        if (feature.geometry) {
                            // Handle both Polygon and MultiPolygon
                            const coordinates = feature.geometry.type === 'Polygon' 
                                ? [feature.geometry.coordinates[0]] // Wrap in array for consistent handling
                                : feature.geometry.coordinates;
                            
                            coordinates.forEach(polygon => {
                                // Ensure we're working with valid coordinates
                                polygon[0].forEach(coord => {
                                    if (Array.isArray(coord) && coord.length >= 2 && 
                                        !isNaN(coord[0]) && !isNaN(coord[1])) {
                                        bounds.extend(coord);
                                    }
                                });
                            });
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
                    
                    // Handle both Polygon and MultiPolygon
                    const coordinates = feature.geometry.type === 'Polygon'
                        ? [feature.geometry.coordinates[0]] // Wrap in array for consistent handling
                        : feature.geometry.coordinates;
                        
                    coordinates.forEach(polygon => {
                        // Ensure we're working with valid coordinates
                        polygon[0].forEach(coord => {
                            if (Array.isArray(coord) && coord.length >= 2 && 
                                !isNaN(coord[0]) && !isNaN(coord[1])) {
                                bounds.extend(coord);
                            }
                        });
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
        }
    }, [geoData]);

    // Update fetchCountyData to handle array input
    const fetchCountyData = async (stateName) => {
        try {
            setIsLoading(true);
            // Normalize state name input
            stateName = normalizeStateName(stateName);

            // For Task2, always request gas data to get all fuel types
            const datasetParam = isTask2Page ? 'gas' : selectedDataset;
            
            // Add the current dataset as a query parameter
            const response = await fetch(`${apiUrl}/api/counties/${stateName}?dataset=${datasetParam}`, {
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
            console.log('County data received:', data);
            
            // Check if we have fuel data for Task2
            if (isTask2Page) {
                const hasGas = data.features.some(f => f.properties.gas !== undefined);
                console.log('County data has gas property:', hasGas);
            }
            
            setCountyData(data);
            
            if (!map.current || !map.current.isStyleLoaded()) {
                console.error('Map or style not loaded');
                setIsLoading(false);
                return;
            }

            // Remove existing layers and source if they exist
            if (map.current.getLayer('county-fills')) {
                map.current.removeLayer('county-fills');
            }
            if (map.current.getLayer('county-borders')) {
                map.current.removeLayer('county-borders');
            }
            if (map.current.getSource('counties')) {
                map.current.removeSource('counties');
            }
            
            // Remove county dot density layers if they exist
            if (map.current.getLayer('county-dot-density-layer')) {
                map.current.removeLayer('county-dot-density-layer');
            }
            if (map.current.getSource('county-dot-density')) {
                map.current.removeSource('county-dot-density');
            }

            // Add new source for counties
            map.current.addSource('counties', {
                type: 'geojson',
                data: data
            });

            // For Task2, generate dot density data for counties
            if (isTask2Page) {
                console.log('Generating county dot density data for Task2');
                
                // Use a much smaller dot value for counties (1000 instead of 50,000)
                const countyDotData = generateMultiAttributeDotDensity(data, fuelTypes, 1000);
                console.log('Generated county dot density data with', countyDotData.features.length, 'points');
                
                // Add county dot density source
                map.current.addSource('county-dot-density', {
                    type: 'geojson',
                    data: countyDotData
                });
                
                // Add light grey county fills first (so they appear below the dots)
                map.current.addLayer({
                    id: 'county-fills',
                    type: 'fill',
                    source: 'counties',
                    paint: {
                        'fill-color': '#f0f0f0',  // Light grey
                        'fill-opacity': 0.4       // Semi-transparent
                    }
                });
                
                // Add county dot density layer on top of the fills
                map.current.addLayer({
                    id: 'county-dot-density-layer',
                    type: 'circle',
                    source: 'county-dot-density',
                    paint: {
                        'circle-radius': 1.5, // Smaller dots for county level
                        'circle-color': ['get', 'color'],
                        'circle-opacity': 0.8
                    }
                });
                
                // Add county borders on top of everything
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
                
                // Hide the state-level dot density layer when showing counties
                if (map.current.getLayer('dot-density-layer')) {
                    map.current.setLayoutProperty('dot-density-layer', 'visibility', 'none');
                }
            } else {
                // For non-Task2, use the original choropleth approach
                // Get current dataset configuration
                const dataset = datasets[selectedDataset];

                // Add fill layer with choropleth colors
                map.current.addLayer({
                    id: 'county-fills',
                    type: 'fill',
                    source: 'counties',
                    paint: {
                        'fill-color': [
                            'interpolate',
                            ['linear'],
                            ['coalesce', ['get', 'value'], 0],
                            ...dataset.breaks.flatMap((break_, i) => [
                                break_,
                                dataset.colors[i]
                            ])
                        ],
                        'fill-opacity': 0.75
                    }
                });

                // Add thin border layer
                map.current.addLayer({
                    id: 'county-borders',
                    type: 'line',
                    source: 'counties',
                    paint: {
                        'line-color': '#fff',
                        'line-width': 0.5,
                        'line-opacity': 0.5
                    }
                });
            }

            // Zoom to the state's counties
            const bounds = new mapboxgl.LngLatBounds();
            data.features.forEach(feature => {
                const coordinates = feature.geometry.type === 'Polygon'
                    ? feature.geometry.coordinates[0]
                    : feature.geometry.coordinates.flat(1);
                coordinates.forEach(coord => bounds.extend(coord));
            });

            map.current.fitBounds(bounds, {
                padding: 100,
                duration: 1000,
                maxZoom: 7
            });

            setShowingCounties(true);
            setIsLoading(false);
        } catch (error) {
            console.error('Error fetching county data:', error);
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
                    '#fff'
                ]);
                map.current.setPaintProperty('county-borders', 'line-width', [
                    'case',
                    ['==', ['get', 'county_name'], countyName],
                    2,
                    0.5
                ]);
            }
        }
    }, [countyData]);

    // Remove the local Ctrl+M handler useEffect and instead add an effect to announce map interaction changes
    useEffect(() => {
        // Announce map interaction state changes
        setStateAnnouncement(
            isMapInteractive 
                ? 'Map interaction enabled. Press Tab to focus on a state.' 
                : 'Chat interaction enabled. Type a question to ask MappieTalkie.'
        );
    }, [isMapInteractive]);

    // Keep the keyboard navigation effect
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (!isMapInteractive) return;

            // Handle initial focus
            if (e.key === 'Tab') {
                e.preventDefault();
                if (!currentFocusedState && !showingCounties) {
                    setCurrentFocusedState('Kansas');
                    onStateFocus('Kansas');
                    setStateAnnouncement('Now focused on Kansas state');
                    focusStateOnMap('Kansas');
                } else if (showingCounties && !currentFocusedCounty) {
                    const firstCounty = countyData?.features[0]?.properties.county_name;
                    if (firstCounty) {
                        setCurrentFocusedCounty(firstCounty);
                        onFocusedCountyChange(firstCounty);
                        setStateAnnouncement(`Now focused on ${firstCounty} county`);
                        focusCountyOnMap(firstCounty);
                    }
                }
            }

            // Handle arrow key navigation
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
                
                const normalizedState = normalizeStateName(currentFocusedState);
                if (!normalizedState || (showingCounties && !currentFocusedCounty)) {
                    setStateAnnouncement('Press Tab to focus on a state before using arrow keys');
                    return;
                }

            const direction = {
                'ArrowUp': 'north',
                'ArrowDown': 'south',
                'ArrowLeft': 'west',
                'ArrowRight': 'east'
            }[e.key];

            if (showingCounties && currentFocusedCounty) {
                // County-level navigation
                const adjacentCounties = findAdjacentCounties(currentFocusedCounty);
                const nextCounty = adjacentCounties?.[direction];

                if (nextCounty) {
                    setCurrentFocusedCounty(nextCounty);
                    onFocusedCountyChange(nextCounty);
                    setStateAnnouncement(`Now focused on ${nextCounty} county`);
                    focusCountyOnMap(nextCounty);
                } else {
                    setStateAnnouncement(
                        `There is no county ${direction} of ${currentFocusedCounty}`
                    );
                }
            } else {
                // State-level navigation
                const adjacentStates = findAdjacentStates(normalizedState);
                const nextState = adjacentStates?.[direction];

                if (nextState) {
                    setCurrentFocusedState(nextState);
                    onStateFocus(nextState);
                    setStateAnnouncement(`Now focused on ${nextState} state`);
                    focusStateOnMap(nextState);
                } else {
                    setStateAnnouncement(
                        `There is no state ${direction} of ${normalizedState}`
                    );
                }
            }
        }

            // Handle zoom in/out
            if ((e.key === '=' || e.key === '+') && currentFocusedState) {
                e.preventDefault();
                if (!showingCounties) {
                    fetchCountyData(currentFocusedState);
                    setStateAnnouncement(`Showing counties in ${currentFocusedState}. Press Tab to focus on a county.`);
                    setCurrentFocusedCounty(null);
                }
            }

        if (e.key === '-' && showingCounties) {
            e.preventDefault();
            setShowingCounties(false);
            setCurrentFocusedCounty(null);
            setCountyData(null);
            
            // Clean up county layers
            if (map.current) {
                if (map.current.getLayer('county-borders')) {
                    map.current.removeLayer('county-borders');
                }
                if (map.current.getLayer('county-fills')) {
                    map.current.removeLayer('county-fills');
                }
                if (map.current.getLayer('county-dot-density-layer')) {
                    map.current.removeLayer('county-dot-density-layer');
                }
                if (map.current.getSource('county-dot-density')) {
                    map.current.removeSource('county-dot-density');
                }
                if (map.current.getSource('counties')) {
                    map.current.removeSource('counties');
                }
                
                // Show the state-level dot density layer again when returning to state view
                if (isTask2Page && map.current.getLayer('dot-density-layer')) {
                    map.current.setLayoutProperty('dot-density-layer', 'visibility', 'visible');
                }
            }
            
            // Normalize currentFocusedState before using it
            const stateName = Array.isArray(currentFocusedState) 
                ? currentFocusedState[0] 
                : currentFocusedState;
            
            focusStateOnMap(stateName);
            setStateAnnouncement(`Returned to state view of ${stateName}`);
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
}, [
    isMapInteractive,
    currentFocusedState,
    currentFocusedCounty,
    showingCounties,
    countyData,
    findAdjacentStates,
    findAdjacentCounties,
    focusStateOnMap,
    focusCountyOnMap,
    onFocusedCountyChange,
    onStateFocus,
    normalizeStateName,
    fetchCountyData
]);

    // Update effect to sync with parent's state
    useEffect(() => {
        // Only update if the values are actually different
        const currentStateNormalized = Array.isArray(currentFocusedState) 
            ? currentFocusedState[0] 
            : currentFocusedState;
        const focusedStateNormalized = Array.isArray(focusedState) 
            ? focusedState[0] 
            : focusedState;

        if (currentStateNormalized !== focusedStateNormalized) {
            setCurrentFocusedState(focusedState);
            // Focus the map on the new state
            if (focusedState) {
                focusStateOnMap(focusedStateNormalized);
            }
        }
    }, [focusedState, focusStateOnMap]);

    // In ChoroplethMap.js, add a useEffect to handle map interaction focus
    useEffect(() => {
        if (isMapInteractive && mapContainer.current) {
            // Focus on the map container when map interaction is enabled
            mapContainer.current.focus();
        } else if (!isMapInteractive && mapContainer.current) {
            // Remove focus when map interaction is disabled
            mapContainer.current.blur();
        }
    }, [isMapInteractive]);

    // Add these functions to track map viewport
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
                        currentFocusedState,
                        currentFocusedCounty,
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
                        currentFocusedState,
                        currentFocusedCounty,
                        'map'
                    );
                }
            });
        }
    }, [map.current]);

    // Update the handleStateClick function
    const handleStateClick = (e) => {
        if (!isMapInteractive) return;
        
        onMapClick();
        const clickedState = e.features[0].properties.state_name;
        
        // Log the state click interaction
        logMapInteraction(
            'state_click', 
            {
                zoom: map.current.getZoom(),
                center: map.current.getCenter(),
                bounds: map.current.getBounds()
            },
            clickedState,
            null,
            'map'
        );
        
        // Rest of your existing code...
    };

    // Update the handleCountyClick function
    const handleCountyClick = (e) => {
        if (!isMapInteractive || !showingCounties) return;
        
        onMapClick();
        const clickedCounty = e.features[0].properties.county_name;
        
        // Log the county click interaction
        logMapInteraction(
            'county_click', 
            {
                zoom: map.current.getZoom(),
                center: map.current.getCenter(),
                bounds: map.current.getBounds()
            },
            currentFocusedState,
            clickedCounty,
            'map'
        );
        
        // Rest of your existing code...
    };

    // Also add a useEffect to update selectedDataset when any of the page type props change
    useEffect(() => {
        if (isTask2Page) {
            setSelectedDataset('gas');
        } else if (isTaskPage) {
            setSelectedDataset('pct_tot_co');
        } else {
            setSelectedDataset(dataset || 'ppl_densit');
        }
    }, [isTask2Page, isTaskPage, dataset]);

    // Update the useEffect that generates dot density data
    useEffect(() => {
        if (isTask2Page && geoData && geoData.features && geoData.features.length > 0) {
            console.log("Generating multi-attribute dot density data from", geoData.features.length, "features");
            
            const dotData = generateMultiAttributeDotDensity(geoData, fuelTypes);
            console.log("Generated dot density data with", dotData.features.length, "points");
            setDotDensityData(dotData);
        }
    }, [isTask2Page, geoData, apiUrl]);

    // Update the useEffect that adds the dot density layer
    useEffect(() => {
        // Only proceed if we have both the map initialized and dot data
        if (isTask2Page && dotDensityData && map.current && layersInitialized) {
            console.log("Map is initialized and dot data is ready, adding dot density layers");
            
            // Check if source already exists
            if (!map.current.getSource('dot-density')) {
                console.log("Adding dot density source");
                map.current.addSource('dot-density', {
                    type: 'geojson',
                    data: dotDensityData
                });
            } else {
                console.log("Updating existing dot density source");
                map.current.getSource('dot-density').setData(dotDensityData);
            }
            
            // Add layer if it doesn't exist - using data-driven styling for colors
            if (!map.current.getLayer('dot-density-layer')) {
                console.log("Adding dot density layer");
                map.current.addLayer({
                    id: 'dot-density-layer',
                    type: 'circle',
                    source: 'dot-density',
                    paint: {
                        'circle-radius': 2,
                        'circle-color': ['get', 'color'], // Use the color property from each point
                        'circle-opacity': 0.8
                    }
                }, 'state-borders'); // Make sure it's above other layers
                console.log("Dot density layer added");
            } else {
                console.log("Dot density layer already exists");
            }
            
            // Hide the choropleth layer for task2 but keep state borders visible
            if (map.current.getLayer('population-density')) {
                map.current.setLayoutProperty('population-density', 'visibility', 'none');
            }
            
            // Make sure state borders are visible
            if (map.current.getLayer('state-borders')) {
                map.current.setPaintProperty('state-borders', 'line-opacity', 0.5);
                map.current.setPaintProperty('state-borders', 'line-width', 1);
                map.current.setPaintProperty('state-borders', 'line-color', '#000');
            }
        }
    }, [isTask2Page, dotDensityData, layersInitialized]);

    // Add a function to toggle between choropleth and dot density views
    const toggleDotDensity = (show) => {
        if (!map.current) return;
        
        if (show) {
            // Hide choropleth layer
            map.current.setLayoutProperty('population-density', 'visibility', 'none');
            // Show dot density layer
            if (map.current.getLayer('dot-density-layer')) {
                map.current.setLayoutProperty('dot-density-layer', 'visibility', 'visible');
            }
            // Make sure state borders are visible
            if (map.current.getLayer('state-borders')) {
                map.current.setPaintProperty('state-borders', 'line-opacity', 0.5);
            }
        } else {
            // Show choropleth layer
            map.current.setLayoutProperty('population-density', 'visibility', 'visible');
            // Hide dot density layer
            if (map.current.getLayer('dot-density-layer')) {
                map.current.setLayoutProperty('dot-density-layer', 'visibility', 'none');
            }
        }
    };

    // Add a useEffect to automatically show dot density for task2
    useEffect(() => {
        if (map.current && map.current.loaded()) {
            toggleDotDensity(isTask2Page);
        }
    }, [isTask2Page, layersInitialized]);

    // Add a cleanup effect to remove the dot density layer when component unmounts
    useEffect(() => {
        return () => {
            if (map.current && map.current.getLayer('dot-density-layer')) {
                map.current.removeLayer('dot-density-layer');
                if (map.current.getSource('dot-density')) {
                    map.current.removeSource('dot-density');
                }
            }
        };
    }, []);

    // Add this useEffect to sync the local state with the prop
    useEffect(() => {
        setSelectedDataset(dataset);
    }, [dataset]);

    // Add mousemove handler for state borders (especially for Task2)
    useEffect(() => {
        if (map.current && layersInitialized) {
            map.current.on('mousemove', 'state-borders', (e) => {
            if (e.features.length > 0) {
                console.log('Mousemove detected on state-borders layer');
                map.current.getCanvas().style.cursor = 'pointer';
                
                const feature = e.features[0];
                const stateName = feature.properties.state_name;
                
                // Debug log the feature properties
                console.log('State border feature properties:', feature.properties);
                
                // Format tooltip content based on dataset
                let tooltipContent;
                
                if (isTask2Page) {
                    // For Task2, use the actual fuel values
                    const gas = feature.properties.gas || 0;
                    const electricity = feature.properties.electricity || 0;
                    const oil = feature.properties.oil || 0;
                    
                    tooltipContent = `
                        <div class="text-xs font-semibold">${stateName}</div>
                        <div class="text-xs">Gas: ${gas.toLocaleString()} households</div>
                        <div class="text-xs">Electricity: ${electricity.toLocaleString()} households</div>
                        <div class="text-xs">Oil: ${oil.toLocaleString()} households</div>
                    `;
                } else {
                    // For other pages, show the current dataset value
                    const value = feature.properties.value;
                    
                    tooltipContent = `
                        <div class="text-xs font-semibold">${stateName}</div>
                        <div class="text-xs">${value ? value.toFixed(2) : 'N/A'}</div>
                    `;
                }

                const coordinates = e.lngLat;
                console.log('Setting popup at coordinates from borders:', coordinates);

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
    }
}, [selectedDataset, layersInitialized, isTask2Page]);

    // Add mousemove handler for county dot density layer
    useEffect(() => {
        if (map.current && layersInitialized && isTask2Page) {
            // Add mousemove handler for county dot density
            map.current.on('mousemove', 'county-dot-density-layer', (e) => {
                if (e.features.length > 0) {
                    map.current.getCanvas().style.cursor = 'pointer';
                    
                    const feature = e.features[0];
                    const county = feature.properties.county || 'Unknown County';
                    const state = feature.properties.state || 'Unknown State';
                    const attribute = feature.properties.attribute || 'Unknown';
                    
                    const tooltipContent = `
                        <div class="text-xs font-semibold">${county}, ${state}</div>
                        <div class="text-xs">Fuel type: ${attribute}</div>
                    `;
                    
                    const coordinates = e.lngLat;
                    
                    popup.current
                        .setLngLat(coordinates)
                        .setHTML(tooltipContent)
                        .addTo(map.current);
                }
            });
            
            map.current.on('mouseleave', 'county-dot-density-layer', () => {
                map.current.getCanvas().style.cursor = '';
                popup.current.remove();
            });
        }
    }, [layersInitialized, isTask2Page]);

    // Add this to the useEffect that handles showSpatialClusters changes
    useEffect(() => {
        if (!map.current || !geoData) return;

        // For Task2, show predominant fuel choropleth when showing patterns
        if (isTask2Page && showSpatialClusters) {
            // Keep dot density layer visible - remove the code that hides it
            // if (map.current.getLayer('dot-density-layer')) {
            //     map.current.setLayoutProperty('dot-density-layer', 'visibility', 'none');
            // }
            
            // Add or update predominant fuel layer
            if (!map.current.getLayer('predominant-fuel')) {
                map.current.addLayer({
                    id: 'predominant-fuel',
                    type: 'fill',
                    source: 'population',
                    paint: {
                        'fill-color': [
                            'match',
                            ['get', 'main_fuel'],
                            'gas', '#ff0000',      // Red for gas
                            'electricity', '#0000ff', // Blue for electricity
                            'oil', '#00aa00',      // Green for oil
                            '#cccccc'              // Default gray
                        ],
                        'fill-opacity': 0.2
                    }
                }, 'dot-density-layer'); // Place below dot density layer so dots are visible on top
            } else {
                map.current.setLayoutProperty('predominant-fuel', 'visibility', 'visible');
            }
            
            // Add a legend for predominant fuel
            setShowPredominantFuelLegend(true);
            
            // Make sure LISA clusters are hidden for Task2
            if (map.current.getLayer('lisa-clusters-fill')) {
                map.current.setLayoutProperty('lisa-clusters-fill', 'visibility', 'none');
            }
            if (map.current.getLayer('lisa-clusters')) {
                map.current.setLayoutProperty('lisa-clusters', 'visibility', 'none');
            }
        } else if (isTask2Page) {
            // Hide predominant fuel layer when not showing patterns
            if (map.current.getLayer('predominant-fuel')) {
                map.current.setLayoutProperty('predominant-fuel', 'visibility', 'none');
            }
            
            // Show dot density layer (this should already be visible)
            if (map.current.getLayer('dot-density-layer')) {
                map.current.setLayoutProperty('dot-density-layer', 'visibility', 'visible');
            }
            
            // Hide the legend
            setShowPredominantFuelLegend(false);
        } else {
            // Handle non-Task2 pages (original LISA clusters logic)
            if (showSpatialClusters) {
                // Show LISA clusters
                map.current.setLayoutProperty('lisa-clusters-fill', 'visibility', 'visible');
                map.current.setLayoutProperty('lisa-clusters', 'visibility', 'visible');
                
                // Make state borders more visible
                map.current.setPaintProperty('state-borders', 'line-opacity', 0.8);
                map.current.setPaintProperty('state-borders', 'line-width', 1.5);
            } else {
                // Hide LISA clusters
                map.current.setLayoutProperty('lisa-clusters-fill', 'visibility', 'none');
                map.current.setLayoutProperty('lisa-clusters', 'visibility', 'none');
                
                // Reset state borders
                map.current.setPaintProperty('state-borders', 'line-opacity', isTask2Page ? 0.5 : 0);
                map.current.setPaintProperty('state-borders', 'line-width', 1);
            }
        }
    }, [showSpatialClusters, geoData, isTask2Page]);

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
            {(currentFocusedState || stateAnnouncement) && (
                <div 
                    id="map-interaction-announcement"
                    className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white p-4 rounded-lg shadow-lg"
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                >
                    {stateAnnouncement || `Now focused on ${currentFocusedState} state`}
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
                {!isTask2Page && (
                    <div className="mb-4">
                        <h3 className="text-sm font-bold mb-2">Dataset</h3>
                        <select
                            value={selectedDataset}
                            onChange={(e) => {
                                const newDataset = e.target.value;
                                setSelectedDataset(newDataset);
                                onDatasetChange(newDataset);
                            }}
                            className="block w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {isTaskPage ? (
                                <>
                                    <option value="pct_tot_co">Priority Population</option>
                                    <option value="pct_no_bb_">Lacking Broadband Access</option>
                                </>
                            ) : (
                                <>
                                    <option value="ppl_densit">Population Density</option>
                                    <option value="walk_to_wo">Walking to Work</option>
                                    <option value="transit_to">Public Transit to Work</option>
                                </>
                            )}
                        </select>
                    </div>
                )}
                
                {/* Legend - Show choropleth legend only for non-task2 pages */}
                {!isTask2Page && (
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
                )}
                
                {/* Dot Density Legend - Show only for task2 */}
                {isTask2Page && (
                    <div className="mt-2">
                        <h3 className="text-sm font-bold mb-2">Heating Fuel Types</h3>
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center">
                                <div className="w-4 h-4 mr-2 rounded-full" style={{ backgroundColor: '#ff0000' }}></div>
                                <span className="text-xs">Gas (1 dot = 100,000 households)</span>
                            </div>
                            <div className="flex items-center">
                                <div className="w-4 h-4 mr-2 rounded-full" style={{ backgroundColor: '#0000ff' }}></div>
                                <span className="text-xs">Electricity (1 dot = 100,000 households)</span>
                            </div>
                            <div className="flex items-center">
                                <div className="w-4 h-4 mr-2 rounded-full" style={{ backgroundColor: '#00aa00' }}></div>
                                <span className="text-xs">Oil (1 dot = 100,000 households)</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* LISA Clusters Legend with close button */}
            {showSpatialClusters && !isTask2Page &&(
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

            {/* Predominant Fuel Legend - Show only for task2 when showing patterns */}
            {isTask2Page && showPredominantFuelLegend && (
                <div className="absolute bottom-10 left-4 bg-white p-3 rounded-md shadow-md z-10">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-sm font-bold">Predominant Heating Fuel</h3>
                        <button 
                            onClick={() => {
                                setShowPredominantFuelLegend(false);
                                // Also turn off the spatial clusters when closing the legend
                                onSpatialClustersToggle(false);
                            }}
                            className="text-gray-500 hover:text-gray-700"
                            aria-label="Close legend"
                        >
                            ×
                        </button>
                    </div>
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center">
                            <div className="w-4 h-4 mr-2" style={{ backgroundColor: '#ff0000' }}></div>
                            <span className="text-xs">Gas</span>
                        </div>
                        <div className="flex items-center">
                            <div className="w-4 h-4 mr-2" style={{ backgroundColor: '#0000ff' }}></div>
                            <span className="text-xs">Electricity</span>
                        </div>
                        <div className="flex items-center">
                            <div className="w-4 h-4 mr-2" style={{ backgroundColor: '#00aa00' }}></div>
                            <span className="text-xs">Oil</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChoroplethMap;
