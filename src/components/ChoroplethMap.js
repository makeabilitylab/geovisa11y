import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import populationDensity from '../data/population_density.geojson';

const ChoroplethMap = ({ onStateClick, selectedStates }) => {
    const mapContainer = useRef(null);
    const map = useRef(null);

    // Update borders whenever selectedStates changes
    useEffect(() => {
        if (map.current && map.current.isStyleLoaded()) {
            const selectedStateIds = selectedStates.map(state => state.id);
            map.current.setPaintProperty('state-borders', 'line-opacity', [
                'case',
                ['in', ['get', 'GEOID'], ['literal', selectedStateIds]],
                1,
                0
            ]);
        }
    }, [selectedStates]);

    useEffect(() => {
        if (map.current) return;

        mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;
        map.current = new mapboxgl.Map({
            container: mapContainer.current,
            style: 'mapbox://styles/mapbox/light-v10',
            center: [-96, 37.8],
            zoom: 4
        });

        // Add navigation control (zoom buttons and rotation)
        map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

        // Fullscreen control
        map.current.addControl(new mapboxgl.FullscreenControl(), 'top-right');

        // Scale control
        map.current.addControl(new mapboxgl.ScaleControl(), 'bottom-left');

        // Add geolocate control
        map.current.addControl(
            new mapboxgl.GeolocateControl({
                positionOptions: {
                    enableHighAccuracy: true
                },
                trackUserLocation: true
            }),
            'top-right'
        );

        map.current.on('load', () => {
            map.current.addSource('population', {
                type: 'geojson',
                data: populationDensity
            });

            map.current.addLayer({
                id: 'population-density',
                type: 'fill',
                source: 'population',
                paint: {
                    'fill-color': [
                        'interpolate',
                        ['linear'],
                        ['get', 'ppl_density'],
                        0, '#F2F12D',
                        100, '#E6B71E',
                        1000, '#CA8323',
                        8000, '#8B4225',
                        12000, '#723122'
                    ],
                    'fill-opacity': 0.75
                }
            });

            map.current.addLayer({
                id: 'state-borders',
                type: 'line',
                source: 'population',
                paint: {
                    'line-color': '#627BC1',
                    'line-width': 2,
                    'line-opacity': 0  // Start with all borders invisible
                }
            });

            // Click geometry interaction
            map.current.on('click', 'population-density', (e) => {
                if (e.features.length > 0) {
                    const stateId = e.features[0].properties.GEOID;
                    const stateName = e.features[0].properties.state_name;
                    
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
    }, [onStateClick]); // Remove clickedStateIds from dependencies here

    return (
        <div className="relative h-full">
            <div ref={mapContainer} className="h-full" />

            {/* Legend */}
            <div className="absolute bottom-0 right-0 bg-white p-4 m-4 rounded-lg shadow-lg opacity-90">
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
        </div>
    );
};

export default ChoroplethMap;