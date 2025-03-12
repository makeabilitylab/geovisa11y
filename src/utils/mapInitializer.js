/**
 * Utility functions for initializing Mapbox maps
 */
import mapboxgl from 'mapbox-gl';
import { makeAllMapControlsAccessible } from './mapAccessibility';

/**
 * Initializes map layers and controls for a choropleth map
 * 
 * @param {Object} map - The mapbox map instance
 * @param {Object} mapContainer - Reference to the map container DOM element
 * @param {Object} popup - Reference to the map popup
 * @param {Object} datasets - Configuration for the datasets
 * @param {string} selectedDataset - The currently selected dataset
 * @param {Function} fetchData - Function to fetch map data
 */
export const initializeChoroLayers = (map, mapContainer, popup, datasets, selectedDataset, fetchData) => {
    try {
        // Add navigation controls
        map.addControl(new mapboxgl.NavigationControl(), 'top-right');
        
        // Add fullscreen control
        map.addControl(new mapboxgl.FullscreenControl(), 'top-right');
        
        // Add scale control
        map.addControl(new mapboxgl.ScaleControl(), 'bottom-right');
        
        // Make all map controls accessible
        makeAllMapControlsAccessible(mapContainer);

        // Initialize popup
        if (!popup.current) {
            popup.current = new mapboxgl.Popup({
                closeButton: false,
                closeOnClick: false
            });
        }

        // Add the population source
        map.addSource('states', {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: []
            }
        });

        // Add population density layer first (bottom layer)
        map.addLayer({
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
        map.addLayer({
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
        map.addLayer({
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
        map.addLayer({
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
        map.on('mousemove', 'state-choropleth', (e) => {
            if (e.features.length > 0) {
                map.getCanvas().style.cursor = 'pointer';
                
                const feature = e.features[0];
                const value = feature.properties.value;
                const stateName = feature.properties.state_name;

                let tooltipContent;

                // Format value based on current dataset
                let formattedValue;
                if (selectedDataset === 'ppl_densit') {
                    formattedValue = `${value.toFixed(2)} people/sqm`;
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
                    .addTo(map);
            }
        });

        map.on('mouseleave', 'state-choropleth', () => {
            map.getCanvas().style.cursor = '';
            popup.current.remove();
        });

        // Fetch initial data
        fetchData();

    } catch (error) {
        console.error('Error in initializeChoroLayers:', error);
    }
};

/**
 * Initializes map layers and controls for a dot density map
 * 
 * @param {Object} map - The mapbox map instance
 * @param {Object} mapContainer - Reference to the map container DOM element
 * @param {Object} popup - Reference to the map popup
 * @param {Function} fetchData - Function to fetch map data
 */
export const initializeDotDensityLayers = (map, mapContainer, popup, fetchData) => {
    try {
        // Add navigation controls
        map.addControl(new mapboxgl.NavigationControl(), 'top-right');
        
        // Add fullscreen control
        map.addControl(new mapboxgl.FullscreenControl(), 'top-right');
        
        // Add scale control
        map.addControl(new mapboxgl.ScaleControl(), 'bottom-right');
        
        // Make all map controls accessible
        makeAllMapControlsAccessible(mapContainer);

        // Initialize popup
        if (!popup.current) {
            popup.current = new mapboxgl.Popup({
                closeButton: false,
                closeOnClick: false
            });
        }

        // Add the population source
        map.addSource('population', {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: []
            }
        });

        // Add population density layer first (bottom layer)
        map.addLayer({
            id: 'state-choropleth',
            type: 'fill',
            source: 'population',
            paint: {
                'fill-color': '#f5f5f5',
                'fill-opacity': 0.75
            },
            layout: {
                'visibility': 'none' // Hidden by default for dot density
            }
        });

        // Add state borders layer
        map.addLayer({
            id: 'state-borders',
            type: 'line',
            source: 'population',
            paint: {
                'line-color': '#cfd8dc',
                'line-width': 2,
                'line-opacity': 0.8,
            },
            // Ensure this layer is always on top
            maxzoom: 24
        });

        // Add a light grey fill layer behind the dots
        map.addLayer({
            id: 'state-base',
            type: 'fill',
            source: 'population',
            paint: {
                'fill-color': '#f5f5f5', // Light grey fill
                'fill-opacity': 0.7
            }
        }, 'state-borders');

        // Add mousemove handler for popup on state-base layer
        map.on('mousemove', 'state-base', (e) => {
            if (e.features.length > 0) {
                map.getCanvas().style.cursor = 'pointer';
                
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
                    .addTo(map);
            }
        });
        
        map.on('mouseleave', 'state-base', () => {
            map.getCanvas().style.cursor = '';
            popup.current.remove();
        });

        // Fetch initial data
        fetchData();
    } catch (error) {
        console.error('Error in initializeDotDensityLayers:', error);
    }
}; 