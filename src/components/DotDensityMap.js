import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { logMapInteraction } from '../utils/logger';
import { generateMultiAttributeDotDensity } from '../utils/DotDensityGenerator';
import { initializeDotDensityLayers } from '../utils/mapInitializer';
import { useMapLayers } from '../utils/mapUtils';

const DotDensityMap = ({ 
    focus = { type: null, states: [], county: null, city: null, highlightOnly: false },
    onFocusChange,
    dataset, 
    showSpatialClusters, 
    onSpatialClustersToggle,
    apiUrl, 
    isMapInteractive, 
    onMapClick, 
    onShowingCountiesChange,
    onAnnounce
}) => {
    const mapContainer = useRef(null);
    const map = useRef(null);
    const popup = useRef(null);
    const [selectedDataset, setSelectedDataset] = useState('gas');
    const [geoData, setGeoData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [layersInitialized, setLayersInitialized] = useState(false);
    
    const [showingCounties, setShowingCounties] = useState(false);

    const [countyData, setCountyData] = useState(null);
    
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

    // Replace utility functions with custom hook
    const {
        toggleLayerVisibility,
        toggleLayerSet,
        layerExists,
        sourceExists,
        removeLayersSafely,
        removeSourceSafely
    } = useMapLayers(map);

    //Define layer groups
    const stateLayers = ['state-base', 'state-borders', 'state-dot-density-layer'];
    const countyLayers = ['county-base', 'county-borders', 'county-dot-density-layer'];
    const statePatternLayers = ['state-choropleth'];
    const countyPatternLayers = ['county-choropleth'];
    


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
        return data;
    } catch (error) {
        console.error('Error fetching county data:', error);
        return null;
    } finally {
        setIsLoading(false);
    }
    };
     // Create and update county map layers
    const visualizeCountyLayers = (data) => {
        if (!map.current || !map.current.isStyleLoaded() || !data) {
            return;
        }

        // Remove existing layers and source if they exist
        removeLayersSafely(countyLayers);
        removeSourceSafely('counties');

        // Add new source for counties
        map.current.addSource('counties', {
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
            source: 'counties',
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
            source: 'counties',
            paint: {
                'line-color': '#000',
                'line-width': 0.5,
                'line-opacity': 0.7
            }
        });
        
        // Hide the state-level dot density layer when showing counties
        toggleLayerSet(stateLayers, false);
    };

    // Add tooltips to county layers
    const setupCountyTooltips = () => {
        // Add mousemove handler for county base
        map.current.on('mousemove', 'county-base', (e) => {
            if (e.features.length > 0) {
                map.current.getCanvas().style.cursor = 'pointer';
                
                const feature = e.features[0];
                const countyName = feature.properties.county_name;
                const stateName = feature.properties.state_name;
                
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
    };

    // Zoom to county level
    const zoomToCountyLevel = (data) => {
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
                minZoom: 7
            });
        }
    };

    // Main function to display county layers
    const displayingCountyData = async (stateName) => {
        try {
            // Step 1: Fetch county data
            const data = await fetchCountyData(stateName);
            if (!data) return false;
            
            // Step 2: Create and update map layers
            visualizeCountyLayers(data);
            
            // Step 3: Set up tooltips
            setupCountyTooltips();
            
            // Step 4: Zoom to county level
            zoomToCountyLevel(data);
            
            // Update state
            setShowingCounties(true);
            
            // Notify parent component about county view
            if (onShowingCountiesChange) {
                onShowingCountiesChange(true, stateName);
            }
            
            return true;
        } catch (error) {
            console.error('Error displaying county layers:', error);
            return false;
        }
    };

    // Helper function to focus the map on a county
    const focusCountyOnMap = useCallback((countyName) => {
        if (!map.current || !countyData) return false;
        
        const countyFeature = countyData.features.find(f => 
            f.properties.county_name.toLowerCase() === countyName.toLowerCase()
        );
        
        if (countyFeature && map.current.getLayer('county-borders')) {
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
                0.5
            ]);
            
            // Return true if county was found and highlighted
            return true;
        }
        
        // Return false if county wasn't found or couldn't be highlighted
        return false;
    }, [countyData]);


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
        initializeDotDensityLayers(
            map.current,
            mapContainer.current,
            popup,
            fetchData
        );
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


    // Focus state on map
    const focusStateOnMap = useCallback((stateNames, announceChange = true) => {
        if (!map.current || !geoData) return false;
        
        // Normalize input to array
        const states = Array.isArray(stateNames) ? stateNames : [stateNames];
        
        // If no states provided, reset to default view
        if (states.length === 0) {
            map.current.flyTo({
                center: [-96, 37.8],
                zoom: 4,
                duration: 2000
            });
            return false;
        }
        
        // Gather the features for these states
        const features = states.map(stateName => {
            return geoData.features.find(f =>
                f.properties.state_name.toLowerCase() === stateName.toLowerCase()
            );
        }).filter(Boolean); // Remove any undefined features
        
        if (features.length === 0) {
            // No matching features found
            map.current.flyTo({
                center: [-96, 37.8],
                zoom: 4,
                duration: 2000
            });
            return false;
        }
        
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
                    maxZoom: states.length > 1 ? 7 : 5 // Use different max zoom based on number of states
                });
                
                // Create a case-insensitive filter for all focused states
                const stateFilter = [
                    'in',
                    ['downcase', ['get', 'state_name']],
                    ['literal', states.map(s => s.toLowerCase())]
                ];
                
                // Show state map layers if they were hidden
                toggleLayerVisibility('state-choropleth', true);
                toggleLayerVisibility('state-borders', true);
                
                // Highlight only the desired states
                map.current.setPaintProperty('state-borders', 'line-opacity', [
                    'case',
                    stateFilter,
                    1,
                    0
                ]);
                map.current.setPaintProperty('state-borders', 'line-color', '#000');
                map.current.setPaintProperty('state-borders', 'line-width', 2);
                
                // Announce the change if requested
                if (announceChange && isMapInteractive) {
                    if (states.length > 1) {
                        onAnnounce?.(`Now comparing ${states.join(' and ')}`);
                    } else {
                        onAnnounce?.(`Now focused on ${states[0]} state`);
                    }
                }
                
                return true;
            } else {
                console.warn('No valid coordinates found for bounds');
                return false;
            }
        } catch (error) {
            console.error('Error setting bounds:', error);
            return false;
        }
    }, [geoData, toggleLayerVisibility, isMapInteractive, onAnnounce]);

    // Update effect to handle focused states/counties/cities
    useEffect(() => {
        // if (!map.current || !layersInitialized || !geoData) return;
        // if (!isMapInteractive) {
        //     return;
        //   }

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
            // Clear county layers, turn on state layers
            toggleLayerSet(stateLayers, true);
            toggleLayerSet(countyLayers, false);

            // Update announcement
            if (isMapInteractive) {
                onAnnounce?.(`Now focused on ${name}, ${state}`);
            }

            return;
        }
        
        // 4. Handle county focus
        if (focus.type === 'county' && focus.county) {
            // Hide state layers
            toggleLayerSet(stateLayers, false);
            // Make sure we have a valid state in the states array
            const stateName = focus.states && focus.states.length > 0 ? focus.states[0] : null;
            const countyName = focus.county;
            
            toggleLayerSet(countyLayers, true);
            
            // Check if we already have county data for this state
            const hasCountyData = countyData && sourceExists('counties');
            
            if (hasCountyData) {
                // We already have county data, just highlight the focused county
                const highlighted = focusCountyOnMap(countyName);
                
                if (highlighted && isMapInteractive) {
                    onAnnounce?.(`Now focused on ${countyName}, ${stateName}`);
                }
            } else {
                // We need to display county data first
                // This will fetch the data and set up the layers
                displayingCountyData(stateName).then(() => {
                    // After county data is loaded, highlight the county
                    setTimeout(() => {
                        focusCountyOnMap(countyName);
                        if (isMapInteractive) {
                            onAnnounce?.(`Now focused on ${countyName}, ${stateName}`);
                        }
                    }, 500); // Small delay to ensure layers are ready
                });
            }
        }
        
        // 5. Handle state focus
        else if (focus.type === 'state' || focus.type === 'compare') {
            // Use the enhanced focusStateOnMap function
            focusStateOnMap(focus.states);
        }
    }, [
        focus, 
        layersInitialized, 
        geoData, 
        countyData, 
        datasets, 
        selectedDataset, 
        toggleLayerVisibility, 
        toggleLayerSet,
        sourceExists, 
        countyLayers,
        focusCountyOnMap,
        focusStateOnMap,
        displayingCountyData,
        isMapInteractive,
        onAnnounce,
        stateLayers
    ]);

    // Add helper function at the top level of the component
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

    // Add effect to update the focused state highlight
    useEffect(() => {
        if (map.current && layersInitialized && focus?.type) {
            //turn off county layers
            toggleLayerSet(countyLayers, false);
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
                0.5
            ]);
            // map.current.setPaintProperty('state-borders', 'line-color', '#3b4252');
            // map.current.setPaintProperty('state-borders', 'line-width', 2);
            // map.current.setLayoutProperty('state-borders', 'line-cap', 'round');
        } else if (map.current && layersInitialized) {
            //turn off county layers
            toggleLayerSet(countyLayers, false);
            // Reset the highlight when no state is focused
            // map.current.setPaintProperty('state-borders', 'line-opacity', 0);
            // map.current.setPaintProperty('state-borders', 'line-color', '#ccc');
            // map.current.setLayoutProperty('state-borders', 'line-cap', 'butt');
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
    }, [showSpatialClusters, geoData, focus]);

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
                if (!focus.type) {
                    onFocusChange({
                        type: 'state',
                        states: ['Kansas'],
                        county: null,
                        city: null,
                        highlightOnly: false
                    });
                    if (isMapInteractive) { 
                        onAnnounce?.(`Now focused on Kansas state`);
                        focusStateOnMap('Kansas');
                    }
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
                        if (isMapInteractive) {
                            onAnnounce?.(`Now focused on ${focus.city.state} state`);
                            focusStateOnMap(focus.city.state);
                        }
                    }
                } else if (showingCounties && !focus.county) {
                    const firstCounty = countyData?.features[0]?.properties.county_name;
                    if (firstCounty) {
                        onFocusChange({
                            ...focus,
                            type: 'county',
                            county: firstCounty
                        });
                        if (isMapInteractive) {
                            onAnnounce?.(`Now focused on ${firstCounty} county`);
                            focusCountyOnMap(firstCounty);
                        }
                    }
                }
            }

            // Handle arrow key navigation
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
                
                // If we're focused on a city, show message to press Tab first
                if (focus.type === 'city') {
                    if (isMapInteractive) {
                        onAnnounce?.(`Press Tab to focus on a state before using arrow keys`);
                    }
                    return;
                }
                
                const normalizedState = normalizeStateName(focus.states[0]);
                if (!normalizedState || (focus.type === 'county' && !focus.county)) {
                    if (isMapInteractive) {
                        onAnnounce?.(`Press Tab to focus on a state before using arrow keys`);
                    }
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
                        if (isMapInteractive) {
                            onAnnounce?.(`Now focused on ${nextCounty} county`);
                            focusCountyOnMap(nextCounty);
                        }
                    } else {
                        if (isMapInteractive) {
                            onAnnounce?.(`There is no county ${direction} of ${focus.county}`);
                        }
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
                        if (isMapInteractive) {
                            onAnnounce?.(`Now focused on ${nextState} state`);
                            focusStateOnMap(nextState);
                        }
                    } else {
                        if (isMapInteractive) {
                            onAnnounce?.(
                                `There is no state ${direction} of ${normalizedState}`
                            );
                        }
                    }
                }
            }

            // Handle zoom in to counties
            if ((e.key === '=' || e.key === '+') && focus.states[0]) {
                e.preventDefault();
                if (!showingCounties) {
                    displayingCountyData(focus.states[0]);
                    setShowingCounties(true);
                    if (isMapInteractive) {
                        onAnnounce?.(`Showing counties in ${focus.states[0]}. Press Tab to focus on a county.`);
                    }
                }
            }

            // Handle zoom out from counties
            if (e.key === '-' && showingCounties) {
                e.preventDefault();
                onShowingCountiesChange(false);
                setShowingCounties(false);
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
                    removeSourceSafely('county-dot-density');

                    // show state-level choropleth
                    toggleLayerVisibility('state-choropleth', true);
                    
                    // Show state-level LISA clusters again if they were visible
                    if (showSpatialClusters) {
                        toggleLayerSet(statePatternLayers, true);
                    }
                    
                    // Show state layers
                    toggleLayerSet(stateLayers, true);
                }
                
                focusStateOnMap(focus.states[0]);
                if (isMapInteractive) {
                    onAnnounce?.(`Returned to state view of ${focus.states[0]}`);
                }
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
        showSpatialClusters,
        onShowingCountiesChange,
        toggleLayerVisibility,
        toggleLayerSet,
        countyLayers,
        removeLayersSafely,
        removeSourceSafely
    ]);

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