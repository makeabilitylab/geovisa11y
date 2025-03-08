import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { logMapInteraction } from '../utils/logger';
import { generateDotDensityForFeatureCollection, generateMultiAttributeDotDensity } from '../utils/DotDensityGenerator';

const DotDensityMap = ({ 
    dataset, 
    showSpatialClusters, 
    onSpatialClustersToggle, 
    focusedState, 
    focusedCity, 
    onFocusedCountyChange, 
    onStateFocus, 
    apiUrl, 
    isMapInteractive, 
    onMapClick, 
    onShowingCountiesChange
}) => {
    const mapContainer = useRef(null);
    const map = useRef(null);
    const popup = useRef(null);
    const [selectedDataset, setSelectedDataset] = useState('gas');
    const [geoData, setGeoData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [layersInitialized, setLayersInitialized] = useState(false);

    const [stateAnnouncement, setStateAnnouncement] = useState('');
    const announcementRef = useRef(null);
  
    const [currentFocusedState, setCurrentFocusedState] = useState(null);
   
    const [showingCounties, setShowingCounties] = useState(false);
    const [currentFocusedCounty, setCurrentFocusedCounty] = useState(null);
    const [countyData, setCountyData] = useState(null);
    
    const [currentFocusedCity, setCurrentFocusedCity] = useState(null);
    
    const [dotDensityData, setDotDensityData] = useState(null);
    const [showPredominantFuelLegend, setShowPredominantFuelLegend] = useState(false);

    const datasets = {
        'gas': {
            name: 'Gas Heating Usage',
            breaks: [0, 1000, 2000, 3000, 4000, 5000],
            colors: ['#ffffcc', '#ffeda0', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c']
        }
    };

    const fuelTypes = {
        gas: {
            name: 'Gas Heating',
            color: '#7e57c2',
            dotValue: 100000
        },
        electricity: {
            name: 'Electric Heating',
            color: '#26a69a', 
            dotValue: 100000
        },
        oil: {
            name: 'Oil Heating',
            color: '#f57f17',
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
            const endpoint = 'task2_state';
            
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
                id: 'state-choropleth',
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
                },
                layout: {
                    'visibility': 'none' // Hidden by default for dot density
                }
            });

            // Add state borders layer
            map.current.addLayer({
                id: 'state-borders',
                type: 'line',
                source: 'population',
                paint: {
                    'line-color': '#546e7a', // Grey for Task2
                    'line-width': 1.5,
                    'line-opacity': 0.7,
                },
                // Ensure this layer is always on top
                maxzoom: 24
            });

            // Add a light grey fill layer behind the dots
            map.current.addLayer({
                id: 'state-base',
                type: 'fill',
                source: 'population',
                paint: {
                    'fill-color': '#f5f5f5', // Light grey fill
                    'fill-opacity': 0.7
                }
            }, 'state-borders');

            // Add mousemove handler for popup on state-base layer
            map.current.on('mousemove', 'state-base', (e) => {
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
            
            map.current.on('mouseleave', 'state-base', () => {
                map.current.getCanvas().style.cursor = '';
                popup.current.remove();
            });

            // Fetch initial data
            fetchData();
        } catch (error) {
            console.error('Error in initializeLayers:', error);
        }
    };

    // Initialize map
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

    // Update data when dataset changes (mostly for API consistency with ChoroplethMap)
    useEffect(() => {
        if (map.current && map.current.loaded()) {
            // Reset to default view
            map.current.flyTo({
                center: [-96, 37.8],
                zoom: 4,
                duration: 2000
            });
            
            // Clear state highlights
            map.current.setPaintProperty('state-borders', 'line-opacity', 0.7);
            
            // Clear county view if showing
            if (showingCounties) {
                setShowingCounties(false);
                setCurrentFocusedCounty(null);
                setCountyData(null);
                if (map.current.getLayer('county-borders')) {
                    map.current.removeLayer('county-borders');
                }
                if (map.current.getLayer('county-base')) {
                    map.current.removeLayer('county-base');
                }
                if (map.current.getSource('county-choropleth')) {
                    map.current.removeSource('county-choropleth');
                }
            }
            
            // Announce dataset change
            const datasetName = datasets[selectedDataset]?.name || selectedDataset;
            setStateAnnouncement(`Dataset changed to ${datasetName}`);
            
            // Reset focused state
            setCurrentFocusedState(null);
            onStateFocus(null);
            
            // Fetch new data
            fetchData();
        }
    }, [selectedDataset]);

    // Add helper function at the top level of the component
    const normalizeStateName = (state) => {
        if (Array.isArray(state)) {
            return state[0];  // Take first state if array
        }
        return state;
    };

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
                    if (map.current.getLayer('county-base')) {
                        map.current.removeLayer('county-base');
                    }
                    if (map.current.getSource('county-choropleth')) {
                        map.current.removeSource('county-choropleth');
                    }
                }

                map.current.flyTo({
                    center: [-96, 37.8],
                    zoom: 4,
                    duration: 2000
                });
                
                // Reset state highlights to default
                map.current.setPaintProperty('state-borders', 'line-opacity', 0.7);
                map.current.setPaintProperty('state-borders', 'line-color', '#546e7a');
                map.current.setPaintProperty('state-borders', 'line-width', 1.5);
                
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
                    if (map.current.getLayer('county-base')) {
                        map.current.removeLayer('county-base');
                    }
                    if (map.current.getSource('county-choropleth')) {
                        map.current.removeSource('county-choropleth');
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
                map.current.setPaintProperty('state-borders', 'line-opacity', 0.7);
                map.current.setPaintProperty('state-borders', 'line-color', '#546e7a');
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
                    if (map.current.getLayer('county-base')) {
                        map.current.removeLayer('county-base');
                    }
                    if (map.current.getSource('county-choropleth')) {
                        map.current.removeSource('county-choropleth');
                    }
                }
                
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
                        0.7
                    ]);
                    map.current.setPaintProperty('state-borders', 'line-color', [
                        'case',
                        stateFilter,
                        '#000',
                        '#546e7a'
                    ]);
                    map.current.setPaintProperty('state-borders', 'line-width', [
                        'case',
                        stateFilter,
                        2,
                        1.5
                    ]);
                }
            }
        }
    }, [focusedState, focusedCity, geoData, layersInitialized]);

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

    // Fetch county data
    const fetchCountyData = async (stateName) => {
        try {
            setIsLoading(true);
            // Normalize state name input
            stateName = normalizeStateName(stateName);

            // Always request gas data to get all fuel types
            const datasetParam = 'gas';
            
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
            setCountyData(data);
            
            if (!map.current || !map.current.isStyleLoaded()) {
                setIsLoading(false);
                return;
            }

            // Remove existing layers and source if they exist
            if (map.current.getLayer('county-base')) {
                map.current.removeLayer('county-base');
            }
            if (map.current.getLayer('county-borders')) {
                map.current.removeLayer('county-borders');
            }
            if (map.current.getSource('county-choropleth')) {
                map.current.removeSource('county-choropleth');
            }
            
            // Remove county dot density layers if they exist
            if (map.current.getLayer('county-dot-density-layer')) {
                map.current.removeLayer('county-dot-density-layer');
            }
            if (map.current.getSource('county-dot-density')) {
                map.current.removeSource('county-dot-density');
            }

            // Add new source for counties
            map.current.addSource('county-choropleth', {
                type: 'geojson',
                data: data
            });

            // Generate county dot density data
            console.log('Generating county dot density data');
            
            // Use a much smaller dot value for counties (1000 instead of 100,000)
            const countyDotData = generateMultiAttributeDotDensity(data, fuelTypes, 1000);
            console.log('Generated county dot density data with', countyDotData.features.length, 'points');
            
            // Add county dot density source
            map.current.addSource('county-dot-density', {
                type: 'geojson',
                data: countyDotData
            });
            
            // Add light grey county fills first (so they appear below the dots)
            map.current.addLayer({
                id: 'county-base',
                type: 'fill',
                source: 'county-choropleth',
                paint: {
                    'fill-color': '#f0f0f0',  // Light grey
                    'fill-opacity': 0.4  
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
                source: 'county-choropleth',
                paint: {
                    'line-color': '#000',
                    'line-width': 0.5,
                    'line-opacity': 0.7
                }
            });
            
            // Hide the state-level dot density layer when showing counties
            if (map.current.getLayer('state-dot-density-layer')) {
                map.current.setLayoutProperty('state-dot-density-layer', 'visibility', 'none');
            }

            // Add mousemove handler for county base
            map.current.on('mousemove', 'county-base', (e) => {
                if (e.features.length > 0) {
                    map.current.getCanvas().style.cursor = 'pointer';
                    
                    const feature = e.features[0];
                    const countyName = feature.properties.county_name;
                    const stateName = feature.properties.state_name;
                    
                    // For Task2, show all fuel types at county level
                    const gas = feature.properties.gas || 0;
                    const electricity = feature.properties.electricity || 0;
                    const oil = feature.properties.oil || 0;
                    const isRural = feature.properties.rural ? 
                        (feature.properties.rural === 'Rural' ? 'Rural' : 'Urban') : 
                        'Unknown';
                    
                    const tooltipContent = `
                        <div class="text-xs font-semibold">${countyName} County, ${stateName}</div>
                        <div class="text-xs">County Type: ${isRural}</div>
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
            
            map.current.on('mouseleave', 'county-base', () => {
                map.current.getCanvas().style.cursor = '';
                popup.current.remove();
            });
            
            // Add mousemove handler for county borders
            map.current.on('mousemove', 'county-borders', (e) => {
                if (e.features.length > 0) {
                    map.current.getCanvas().style.cursor = 'pointer';
                    
                    const feature = e.features[0];
                    const countyName = feature.properties.county_name;
                    const stateName = feature.properties.state_name;
                    
                    // For Task2, show all fuel types at county level
                    const gas = feature.properties.gas || 0;
                    const electricity = feature.properties.electricity || 0;
                    const oil = feature.properties.oil || 0;
                    const isRural = feature.properties.rural === 'Rural' ? 'Rural' : 'Urban';
                    
                    const tooltipContent = `
                        <div class="text-xs font-semibold">${countyName} County, ${stateName}</div>
                        <div class="text-xs">Classification: ${isRural}</div>
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
            
            map.current.on('mouseleave', 'county-borders', () => {
                map.current.getCanvas().style.cursor = '';
                popup.current.remove();
            });

            // Zoom to the state's counties
            const bounds = new mapboxgl.LngLatBounds();
            data.features.forEach(feature => {
                if (feature.geometry && feature.geometry.coordinates) {
                    if (feature.geometry.type === 'Polygon') {
                        // For Polygon, get the outer ring coordinates
                        feature.geometry.coordinates[0].forEach(coord => {
                            bounds.extend(coord);
                        });
                    } else if (feature.geometry.type === 'MultiPolygon') {
                        // For MultiPolygon, iterate through each polygon
                        feature.geometry.coordinates.forEach(polygon => {
                            // Get the outer ring of each polygon
                            polygon[0].forEach(coord => {
                                bounds.extend(coord);
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
                    maxZoom: 7
                });
            }

            setShowingCounties(true);
            
            // Notify parent component about county view
            if (onShowingCountiesChange) {
                onShowingCountiesChange(true, stateName);
            }
            
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
                    '#37474f'
                ]);
                map.current.setPaintProperty('county-borders', 'line-width', [
                    'case',
                    ['==', ['get', 'county_name'], countyName],
                    3,
                    0.5
                ]);
            }
        }
    }, [countyData]);

    // Announce map interaction state changes
    useEffect(() => {
        setStateAnnouncement(
            isMapInteractive 
                ? 'Map interaction enabled. Press Tab to focus on a state.' 
                : 'Chat interaction enabled. Type a question to ask MappieTalkie.'
        );
    }, [isMapInteractive]);

    // Focus state on map
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

    // Handle spatial clusters visualization
    useEffect(() => {
        if (!map.current || !geoData) return;

        // Show predominant fuel choropleth when showing patterns
        if (showSpatialClusters) {
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
                            'gas','#7e57c2' , 
                            'electricity','#26a69a',
                            'oil','#f57f17',
                            '#cccccc'   
                        ],
                        'fill-opacity': 0.2
                    }
                }, 'state-dot-density-layer'); // Place below dot density layer so dots are visible on top
            } else {
                map.current.setLayoutProperty('predominant-fuel', 'visibility', 'visible');
            }
            
            // Add a legend for predominant fuel
            setShowPredominantFuelLegend(true);
        } else {
            // Hide predominant fuel layer when not showing patterns
            if (map.current.getLayer('predominant-fuel')) {
                map.current.setLayoutProperty('predominant-fuel', 'visibility', 'none');
            }
            
            // Show dot density layer (this should already be visible)
            if (map.current.getLayer('state-dot-density-layer')) {
                map.current.setLayoutProperty('state-dot-density-layer', 'visibility', 'visible');
            }
            
            // Hide the legend
            setShowPredominantFuelLegend(false);
        }
    }, [showSpatialClusters, geoData, currentFocusedState]);

    // Dot density data generation
    useEffect(() => {
        if (geoData && geoData.features && geoData.features.length > 0) {
            console.log("Generating multi-attribute dot density data from", geoData.features.length, "features");
            
            const dotData = generateMultiAttributeDotDensity(geoData, fuelTypes);
            console.log("Generated dot density data with", dotData.features.length, "points");
            setDotDensityData(dotData);
        }
    }, [geoData, apiUrl]);

    // Add the dot density layer
    useEffect(() => {
        // Only proceed if we have both the map initialized and dot data
        if (dotDensityData && map.current && layersInitialized) {
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
            if (!map.current.getLayer('state-dot-density-layer')) {
                console.log("Adding dot density layer");
                map.current.addLayer({
                    id: 'state-dot-density-layer',
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
            
            // Hide the choropleth layer
            if (map.current.getLayer('state-choropleth')) {
                map.current.setLayoutProperty('state-choropleth', 'visibility', 'none');
            }
            
            // Make sure state borders are visible
            if (map.current.getLayer('state-borders')) {
                map.current.setPaintProperty('state-borders', 'line-opacity', 0.5);
                map.current.setPaintProperty('state-borders', 'line-width', 1);
                map.current.setPaintProperty('state-borders', 'line-color', '#000');
            }

            // Add mousemove handler for dot density layer
            map.current.on('mousemove', 'state-dot-density-layer', (e) => {
                if (e.features.length > 0) {
                    map.current.getCanvas().style.cursor = 'pointer';
                    
                    const feature = e.features[0];
                    const state = feature.properties.state || 'Unknown State';
                    const attribute = feature.properties.attribute || 'Unknown';
                    
                    const tooltipContent = `
                        <div class="text-xs font-semibold">${state}</div>
                        <div class="text-xs">Fuel type: ${attribute}</div>
                    `;
                    
                    const coordinates = e.lngLat;
                    
                    popup.current
                        .setLngLat(coordinates)
                        .setHTML(tooltipContent)
                        .addTo(map.current);
                }
            });
            
            map.current.on('mouseleave', 'state-dot-density-layer', () => {
                map.current.getCanvas().style.cursor = '';
                popup.current.remove();
            });
        }
    }, [dotDensityData, layersInitialized]);

    // Add a cleanup effect to remove the dot density layer when component unmounts
    useEffect(() => {
        return () => {
            if (map.current && map.current.getLayer('state-dot-density-layer')) {
                map.current.removeLayer('state-dot-density-layer');
                if (map.current.getSource('dot-density')) {
                    map.current.removeSource('dot-density');
                }
            }
        };
    }, []);

    // Update the local state with the prop
    useEffect(() => {
        setSelectedDataset(dataset);
    }, [dataset]);

    // Keyboard navigation
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
                    
                    // Hide state-level dot density when showing counties
                    if (map.current && map.current.getLayer('state-dot-density-layer')) {
                        map.current.setLayoutProperty('state-dot-density-layer', 'visibility', 'none');
                    }
                }
            }

            if (e.key === '-' && showingCounties) {
                e.preventDefault();
                setShowingCounties(false);
                setCurrentFocusedCounty(null);
                setCountyData(null);
                if (onShowingCountiesChange) {
                    onShowingCountiesChange(false, null);
                }
                
                // Clean up county layers
                if (map.current) {
                    if (map.current.getLayer('county-borders')) {
                        map.current.removeLayer('county-borders');
                    }
                    if (map.current.getLayer('county-base')) {
                        map.current.removeLayer('county-base');
                    }
                    if (map.current.getLayer('county-dot-density-layer')) {
                        map.current.removeLayer('county-dot-density-layer');
                    }
                    if (map.current.getSource('county-dot-density')) {
                        map.current.removeSource('county-dot-density');
                    }
                    if (map.current.getSource('county-choropleth')) {
                        map.current.removeSource('county-choropleth');
                    }
                    
                    // Show the state-level dot density layer again when returning to state view
                    if (map.current.getLayer('state-dot-density-layer')) {
                        map.current.setLayoutProperty('state-dot-density-layer', 'visibility', 'visible');
                    }
                    
                    // Restore state borders
                    map.current.setPaintProperty('state-borders', 'line-color', '#546e7a');
                    map.current.setPaintProperty('state-borders', 'line-width', 1.5);
                    map.current.setPaintProperty('state-borders', 'line-opacity', 0.7);
                    
                    // Restore state fills
                    if (map.current.getLayer('state-base')) {
                        map.current.setPaintProperty('state-base', 'fill-color', '#f5f5f5');
                        map.current.setPaintProperty('state-base', 'fill-opacity', 0.7);
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
                focusStateOnMap(focusedState);
            }
        }
    }, [focusedState, focusStateOnMap]);

    // Handle map interaction focus
    useEffect(() => {
        if (isMapInteractive && mapContainer.current) {
            // Focus on the map container when map interaction is enabled
            mapContainer.current.focus();
        } else if (!isMapInteractive && mapContainer.current) {
            // Remove focus when map interaction is disabled
            mapContainer.current.blur();
        }
    }, [isMapInteractive]);

    // Track map viewport
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

    // Update the resetToStateView function to properly reset the map and notify parent
    const resetToStateView = () => {
        if (map.current) {
            // Hide county layers if they exist
            if (map.current.getLayer('county-base')) {
                map.current.removeLayer('county-base');
            }
            if (map.current.getLayer('county-borders')) {
                map.current.removeLayer('county-borders');
            }
            if (map.current.getSource('county-choropleth')) {
                map.current.removeSource('county-choropleth');
            }
            
            // Hide county dot density layers if they exist
            if (map.current.getLayer('county-dot-density-layer')) {
                map.current.removeLayer('county-dot-density-layer');
            }
            if (map.current.getSource('county-dot-density')) {
                map.current.removeSource('county-dot-density');
            }
            
            // Reset to US view
            map.current.fitBounds([
                [-125.0, 24.0], // Southwest coordinates
                [-66.0, 50.0]   // Northeast coordinates
            ]);
            
            // Show state layers again
            if (map.current.getLayer('state-base')) {
                map.current.setLayoutProperty('state-base', 'visibility', 'visible');
            }
            if (map.current.getLayer('state-borders')) {
                map.current.setLayoutProperty('state-borders', 'visibility', 'visible');
            }
            if (map.current.getLayer('state-dot-density-layer')) {
                map.current.setLayoutProperty('state-dot-density-layer', 'visibility', 'visible');
            }
            
            // Reset state
            setShowingCounties(false);
            setCurrentFocusedCounty(null);
            setCurrentFocusedState(null);
            
            // Notify parent component
            if (onShowingCountiesChange) {
                console.log('Notifying parent that counties are no longer showing');
                onShowingCountiesChange(false, null);
            }
            
            setStateAnnouncement('Returned to national view.');
        }
    };

    return (
        <div className="relative h-full ">
            <div 
                ref={mapContainer} 
                className="h-full" 
                role="application"
                aria-label="Interactive map of United States heating fuel usage"
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

            {/* Loading dialog for data fetching */}
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

            {/* Legend Container */}
            <div className="absolute top-0 left-0 bg-white p-4 m-4 rounded-lg shadow-lg opacity-90" 
                tabIndex="-1">
                {/* Dot Density Legend */}
                <div className="mt-2">
                    <h3 className="text-sm font-bold mb-2">Heating Fuel Types</h3>
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center">
                            <div className="w-4 h-4 mr-2 rounded-full" style={{ backgroundColor: '#7e57c2' }}></div>
                            <span className="text-xs">Gas (1 dot = 100,000 households)</span>
                        </div>
                        <div className="flex items-center">
                            <div className="w-4 h-4 mr-2 rounded-full" style={{ backgroundColor: '#26a69a' }}></div>
                            <span className="text-xs">Electricity (1 dot = 100,000 households)</span>
                        </div>
                        <div className="flex items-center">
                            <div className="w-4 h-4 mr-2 rounded-full" style={{ backgroundColor: '#f57f17' }}></div>
                            <span className="text-xs">Oil (1 dot = 100,000 households)</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Predominant Fuel Legend - Show only when showing patterns */}
            {showPredominantFuelLegend && (
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
                            <div className="w-4 h-4 mr-2" style={{ backgroundColor: '#7e57c2' }}></div>
                            <span className="text-xs">Gas</span>
                        </div>
                        <div className="flex items-center">
                            <div className="w-4 h-4 mr-2" style={{ backgroundColor: '#26a69a' }}></div>
                            <span className="text-xs">Electricity</span>
                        </div>
                        <div className="flex items-center">
                            <div className="w-4 h-4 mr-2" style={{ backgroundColor: '#f57f17' }}></div>
                            <span className="text-xs">Oil</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DotDensityMap;