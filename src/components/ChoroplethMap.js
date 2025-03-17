import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { logMapInteraction } from '../utils/logger';
import { initializeChoroLayers } from '../utils/mapInitializer';
import { useMapLayers } from '../utils/mapUtils';

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
    showingCounties = false,
    onShowingCountiesChange,
    isTaskPage = false,
    onAnnounce
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

    const [countyData, setCountyData] = useState(null);
    // Add local state to track counties visibility
    const [localCountiesVisible, setLocalCountiesVisible] = useState(showingCounties);

    const datasets = isTaskPage ? {
        'pct_tot_co': {
            name: 'Underserved Population',
            breaks: [75, 80, 85, 90, 95],
            colors: ["#f9ddda", "#f2b9c4", "#e597b9", "#ce78b3", "#ad5fad", "#834ba0"]

        },
        'pct_no_bb_': {
            name: 'Lacking Broadband Access',
            breaks: [5, 7.5, 10, 12.5, 15,],
            colors: ["#f7feae", "#b7e6a5", "#7ccba2", "#46aea0", "#089099", "#00718b"]

        }
    } : {
        'ppl_densit': {
            name: 'Population Density',
            breaks: [10, 50, 100, 200, 500, 1000],
            colors: ["#fef6b5", "#ffdd9a", "#ffc285", "#ffa679", "#fa8a76", "#f16d7a", "#e15383"]

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

    // Define layer groups
    const stateLayers = useMemo(() => ['state-choropleth', 'state-borders'], []);
    const stateLisaLayers = useMemo(() => ['state-lisa-clusters-border'], []);
    const countyLayers = useMemo(() => ['county-choropleth', 'county-borders', 'county-highlight'], []);
    const countyLisaLayers = useMemo(() => ['county-lisa-clusters-border'], []);

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
                    if (isMapInteractive) {
                        onAnnounce?.(`Dataset changed to ${datasetName}`);
                    }
                }
                // Non-task page only has one dataset option, no toggle needed
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedDataset, isTaskPage, onDatasetChange, datasets]);

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


   // Fetch county data
   const fetchCountyData = async (stateName) => {
    try {
        setIsLoading(true);
        // Normalize state name input
        stateName = normalizeStateName(stateName);
        
        // Add the current dataset as a query parameter
        const response = await fetch(`${apiUrl}/api/counties/${stateName}?dataset=${selectedDataset}`, {
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

        console.log('County data received:', data);

        return data;
    } catch (error) {
        console.error('Error fetching county data:', error);
        return null;
    } finally {
        setIsLoading(false);
    }
    };

    // Helper function to focus the map on a county
    const focusCountyOnMap = useCallback((countyName) => {
        if (!map.current || !countyData) return false;
        
        const countyFeature = countyData.features.find(f => 
            f.properties.county_name.toLowerCase() === countyName.toLowerCase()
        );
        
        if (countyFeature && map.current.getLayer('county-borders')) {
            // Remove existing highlight layer if it exists
            if (map.current.getLayer('county-highlight')) {
                map.current.removeLayer('county-highlight');
            }

            // Add a new highlight layer that sits on top
            map.current.addLayer({
                id: 'county-highlight',
                type: 'line',
                source: 'counties',
                paint: {
                    'line-color': '#000',
                    'line-width': 2,
                    'line-opacity': [
                        'case',
                        ['==', ['downcase', ['get', 'county_name']], countyName.toLowerCase()],
                        1,
                        0
                    ]
                }
            });
            
            // Return true if county was found and highlighted
            return true;
        }
        
        // Return false if county wasn't found or couldn't be highlighted
        return false;
    }, [countyData]);

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
                    maxZoom: showingCounties ? 7 : (states.length > 1 ? 7 : 5) // Adjust zoom based on counties view
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
    }, [geoData, toggleLayerVisibility, isMapInteractive, onAnnounce, showingCounties]);

    // Create and update county map layers
    const visualizeCountyLayers = (data) => {
        if (!map.current || !map.current.isStyleLoaded() || !data) {
            return false;
        }


    
        try {
            // Remove existing layers and source if they exist
            removeLayersSafely(countyLayers);
            removeSourceSafely('counties');

            // Add new source for counties
            map.current.addSource('counties', {
                type: 'geojson',
                data: data
            });
            
            // Add county choropleth layer
            map.current.addLayer({
                id: 'county-choropleth',
                type: 'fill',
                source: 'counties',
                paint: {
                    'fill-color': [
                        'interpolate',
                        ['linear'],
                        ['coalesce', ['get', 'value'], 0],
                        ...datasets[selectedDataset].breaks.flatMap((break_, i) => [
                            break_,
                            datasets[selectedDataset].colors[i]
                        ])
                    ],
                    'fill-opacity': 0.7
                }
            });
            
            // Add county borders on top of everything
            map.current.addLayer({
                id: 'county-borders',
                type: 'line',
                source: 'counties',
                paint: {
                    'line-color': '#fff',
                    'line-width': 1,
                    'line-opacity': 0.7
                }
            });
            
            // Hide the state-level layers when showing counties
            toggleLayerSet(stateLayers, false);
            
            return true;
        } catch (error) {
            console.error('Error visualizing county layers:', error);
            return false;
        }
    };

    // Add tooltips to county layers
    const setupCountyTooltips = () => {
        if (!map.current) return false;
        
        try {
            // Add mousemove handler for county choropleth
            map.current.on('mousemove', 'county-choropleth', (e) => {
                if (e.features.length > 0) {
                    map.current.getCanvas().style.cursor = 'pointer';
                    
                    const feature = e.features[0];
                    const countyName = feature.properties.county_name;
                    const stateName = feature.properties.state_name;

                    let tooltipContent;
                    
                    const value = feature.properties.value || 0;

                    // Format value based on current dataset
                    let formattedValue;
                    if (selectedDataset === 'ppl_densit') {
                        formattedValue = `${value.toFixed(2)} people/sqm`;
                    } else {
                            formattedValue = `${value.toFixed(2)}%`;
                    }
                            
                    tooltipContent = `
                        <div class="text-xs font-semibold">${countyName} County, ${stateName}</div>
                        <div class="text-xs">${formattedValue}</div>
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
            
            return true;
        } catch (error) {
            console.error('Error setting up county tooltips:', error);
            return false;
        }
    };

    // Zoom to county level
    const zoomToCountyLevel = (data) => {
        if (!map.current || !data) return false;
        
        try {
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
                    maxZoom: 6,
                    minZoom: 5  // Add minimum zoom to ensure we stay zoomed in enough
                });
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error zooming to county level:', error);
            return false;
        }
    };

    // Main function to display county layers
    const displayingCountyData = async (stateName) => {
        try {

            onShowingCountiesChange(true, stateName);
            setLocalCountiesVisible(true);
            
            console.log('[COUNTY DEBUG] After onShowingCountiesChange, showingCounties should be true, localCountiesVisible:', true);
            
            // Step 1: Fetch county data
            const data = await fetchCountyData(stateName);
            if (!data) return false;
            
            // Step 2: Create and update map layers
            const layersCreated = visualizeCountyLayers(data);
            if (!layersCreated) return false;
            
            // Step 3: Set up tooltips
            setupCountyTooltips();
            
            // Step 4: Zoom to county level
            zoomToCountyLevel(data);
            
            return true;
        } catch (error) {
            console.error('Error displaying county layers:', error);
            return false;
        }
    };

    const initializeLayers = () => {
        initializeChoroLayers(
            map.current, 
            mapContainer.current, 
            popup, 
            datasets, 
            selectedDataset, 
            fetchData
        );
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

                // disable map rotation using right click + drag
                map.current.dragRotate.disable();

                // disable map rotation using touch rotation gesture
                map.current.touchZoomRotate.disableRotation();

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

            if (isMapInteractive) {
                onAnnounce?.(`Dataset changed to ${datasetName}`);
            }
            
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

    // Combined effect to handle LISA clusters for both states and counties
    useEffect(() => {
        if (!map.current || !layersInitialized) return;
        
        if (showSpatialClusters) {
            if (showingCounties) {
                // // Hide state-level LISA clusters
                // toggleLayerSet(stateLisaLayers, false);
                
                // Fetch county-level LISA clusters
                fetch(`${apiUrl}/api/lisa_clusters/${focus.states[0]}?dataset=${selectedDataset}&level=county`)
                    .then(response => response.json())
                    .then(data => {
                        if (sourceExists('counties')) {
                            map.current.getSource('counties').setData(data);
                            
                            // Add county LISA cluster layers if they don't exist
                            if (!layerExists('county-lisa-clusters-border')) {
                                map.current.addLayer({
                                    id: 'county-lisa-clusters-border',
                                    type: 'line',
                                    source: 'counties',
                                    layout: {
                                        'line-join': 'round',
                                        'line-cap': 'round'
                                    },
                                    paint: {
                                        'line-color': [
                                            'match',
                                            ['get', 'lisa_class'],
                                            'LL', '#01579b',
                                            'HL', '#7e57c2',
                                            'LH', '#00acc1',
                                            'HH', '#e91e63',
                                            'transparent'
                                        ],
                                        'line-width': 4,
                                        'line-opacity': [
                                            'case',
                                            ['has', 'lisa_class'],
                                            1,
                                            0
                                        ],
                                        'line-offset': 1,
                                    }
                                });
                            }
                            // Show county LISA layers
                            toggleLayerSet(countyLisaLayers, true);
                            toggleLayerSet(stateLisaLayers, false);
                        }
                    })
                    .catch(error => console.error('Error fetching county LISA clusters:', error));
            } else {
                // Show state LISA clusters at state level
                toggleLayerSet(stateLisaLayers, true);
                toggleLayerSet(countyLisaLayers, false);
            }
        } else {
            // Hide all LISA clusters
            toggleLayerSet(stateLisaLayers, false);
            toggleLayerSet(countyLisaLayers, false);
            
            // Reset state borders when no focus
            if (!focus.type) {
                map.current.setPaintProperty('state-borders', 'line-opacity', 0);
                map.current.setPaintProperty('state-borders', 'line-width', 1);
            }
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

    // UseEffect to handle focused state/county/city
    useEffect(() => {
        if (!map.current || !layersInitialized || !geoData) return;
        
        // Handle city focus
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
            //clear state/county focus
            onFocusChange({
                type: null,
                states: [],
                county: null,
                city: focus.city,
                highlightOnly: false
            });
            // Update announcement
            if (isMapInteractive) {
                onAnnounce?.(`Now focused on ${name}, ${state}`);
            }

            return;
        }
        
        // Handle county focus
        if (focus.type === 'county' && focus.county) {
            // Hide state layers
            toggleLayerSet(stateLayers, false);
            // Make sure we have a valid state in the states array
            const stateName = focus.states && focus.states.length > 0 ? focus.states[0] : null;
            const countyName = focus.county;
            
            toggleLayerSet(countyLayers, true);
            
            // Check if we already have county data for this state
            const hasCountyData = countyData !== null;
            console.log('[COUNTY DEBUG] Has county data:', hasCountyData, 'countyData features:', countyData?.features?.length);
            
            if (hasCountyData) {
                // We already have county data, just highlight the focused county
                const highlighted = focusCountyOnMap(countyName);
                console.log('[COUNTY DEBUG] County highlighted:', highlighted);
                
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
        
        // Handle state focus
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
        stateLayers,
        localCountiesVisible,  // Update dependency
        showingCounties     
    ]);

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

    const resetToStateView = useCallback(() => {
        if (map.current) {
            // Clean up county layers
            removeLayersSafely(countyLayers);
            removeSourceSafely('counties');
            
            // Reset to US view
            map.current.fitBounds([
                [-125.0, 24.0],
                [-66.0, 50.0]   
            ], {
                padding: 100,
                duration: 1000
            });
            
            // Show state layers again
            toggleLayerSet(stateLayers, true);
            
            // Reset county data
            setCountyData(null);
            
            // Reset focus
            onFocusChange({
                type: null,
                states: [],
                county: null,
                city: null,
                highlightOnly: false
            });
            
            // Notify parent component and update local state
            onShowingCountiesChange?.(false, null);
            setLocalCountiesVisible(false);
            
            if (isMapInteractive) {
                onAnnounce?.('Returned to national view');
            }
        }
    }, [map, removeLayersSafely, removeSourceSafely, toggleLayerSet, stateLayers, onShowingCountiesChange, onFocusChange, isMapInteractive, onAnnounce, countyLayers]);

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

    //useEffect to handle showSpatialClusters changes
    useEffect(() => {
        if (!map.current || !geoData) return;

        if (showSpatialClusters) {
            // Show LISA clusters
            toggleLayerSet(stateLisaLayers, true);
        } else {
            // Hide LISA clusters
            toggleLayerSet(stateLisaLayers, false);
            // Reset state borders
            if (!focus.type) {
                map.current.setPaintProperty('state-borders', 'line-opacity', 0);
                map.current.setPaintProperty('state-borders', 'line-width', 1);
            }
        }
    }, [showSpatialClusters, geoData, focus]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (!isMapInteractive) return;

            // Handle initial focus
            if (e.key === 'Tab') {
                e.preventDefault();
                
                // Debug the current focus state
                console.log('Current focus state:', focus);
                
                // Check if we have a city focus, regardless of focus.type
                if (focus.city) {
                    // When focused on a city, Tab should focus on the containing state
                    console.log('City focus detected:', focus.city);
                    
                    // Make sure we have the state property and it's not empty
                    if (focus.city.state) {
                        console.log('Focusing on city state:', focus.city.state);
                        
                        // Update focus to the city's state
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
                    } else {
                        console.error('City state information is missing:', focus.city);
                    }
                } else if (!focus.type) {
                    // Default focus when no focus exists
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
                } else if (localCountiesVisible && !focus.county && countyData) {
                    console.log('[COUNTY DEBUG] Should focus on first county. countyData:', 
                        countyData ? `Found ${countyData.features.length} counties` : 'No county data',
                        'localCountiesVisible:', localCountiesVisible);
                    
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
                        onFocusChange({
                            ...focus,
                            county: focus.county,
                            noNeighbor: direction
                        });
                        // Don't call focusCountyOnMap here as it's already focused
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
                        onFocusChange({
                            type: 'state',
                            states: [normalizedState],
                            county: null,
                            city: null,
                            highlightOnly: false,
                            noNeighbor: direction
                        });
                        if (isMapInteractive) {
                            onAnnounce?.(`There is no state ${direction} of ${normalizedState}`);
                        }
                    }
                }
            }

            // Handle zoom in to counties
            if ((e.key === '=' || e.key === '+') && focus.states[0]) {
                e.preventDefault();
                if (!localCountiesVisible) {
                    displayingCountyData(focus.states[0]);
                    if (isMapInteractive) {
                        onAnnounce?.(`Showing counties in ${focus.states[0]}. Press Tab to focus on a county.`);
                    }
                }
            }

            // Handle zoom out from counties or states
            if (e.key === '-') {
                e.preventDefault();
                if (localCountiesVisible) {
                    onShowingCountiesChange(false);
                    setLocalCountiesVisible(false);
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

                        // Remove existing layers and sources
                        removeLayersSafely(countyLisaLayers);
                        removeLayersSafely(countyLayers);
                        removeSourceSafely('counties');

                        // show state-level choropleth
                        toggleLayerVisibility('state-choropleth', true);
                        
                        // Show state-level LISA clusters again if they were visible
                        if (showSpatialClusters) {
                            toggleLayerSet(stateLisaLayers, true);
                        }
                        
                        // Show state layers
                        toggleLayerSet(stateLayers, true);
                    }
                    
                    focusStateOnMap(focus.states[0]);
                    if (isMapInteractive) {
                        onAnnounce?.(`Returned to state view of ${focus.states[0]}`);
                    }
                } else if (focus.type === 'state') {
                    // If we're at state level, reset to national view
                    resetToStateView();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        isMapInteractive,
        focus,
        showingCounties,
        localCountiesVisible,  // Update dependency
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
        removeSourceSafely,
        resetToStateView,
        sourceExists  
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

    // Add effect to sync showingCounties prop with local state
    useEffect(() => {
        setLocalCountiesVisible(showingCounties);
    }, [showingCounties]);

    // Add effect to update parent when county data is loaded
    useEffect(() => {
        if (countyData && countyData.features && countyData.features.length > 0) {
            console.log('[COUNTY DEBUG] County data loaded, ensuring localCountiesVisible is true');
            setLocalCountiesVisible(true);
            if (!showingCounties) {
                onShowingCountiesChange?.(true, focus.states[0]);
            }
        }
    }, [countyData, showingCounties, onShowingCountiesChange, focus.states]);

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
                                        <span className="text-sm">Lacking Broadband or Computer Access</span>
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
                            <div className="w-4 h-4 mr-2 border-2 border-[#e91e63]"></div>
                            <span className="text-xs">High-High Cluster</span>
                        </div>
                        <div className="flex items-center">
                            <div className="w-4 h-4 mr-2 border-2 border-[#01579b]"></div>
                            <span className="text-xs">Low-Low Cluster</span>
                        </div>
                        <div className="flex items-center">
                            <div className="w-4 h-4 mr-2 border-2 border-[#7e57c2]"></div>
                            <span className="text-xs">High-Low Outlier</span>
                        </div>
                        <div className="flex items-center">
                            <div className="w-4 h-4 mr-2 border-2 border-[#00acc1]"></div>
                            <span className="text-xs">Low-High Outlier</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
        };
            
export default ChoroplethMap;
