import React, { useState } from 'react';
import MapGL, { Source, Layer } from 'react-map-gl';
import populationDensity from '../data/population_density.geojson';

// const ChoroplethMap = () => {
//     return (
//         <MapGL
//             latitude={37.8}
//             longitude={-96}
//             zoom={3}
//             width="100%"
//             height="100%"
//             mapStyle="mapbox://styles/mapbox/streets-v11"
//             mapboxAccessToken='***REDACTED***'
//         />
//     );
// };

// export default ChoroplethMap;


const ChoroplethMap = () => {
    const [viewport, setViewport] = useState({
        latitude: 37.8,
        longitude: -96,
        zoom: 3,
        bearing: 0,
        pitch: 0
    });

    const layerStyle = {
        id: 'population-density',
        type: 'fill',
        paint: {
            'fill-color': [
                'interpolate',
                ['linear'],
                ['get', 'ppl_density'],  // Accessing the 'ppl_density' property
                0, '#F2F12D',
                50, '#EED322',
                100, '#E6B71E',
                500, '#DA9C20',
                1000, '#CA8323',
                2000, '#B86B25',
                4000, '#A25626',
                8000, '#8B4225',
                12000, '#723122'
            ],
            'fill-opacity': 0.75
        }
    };

    return (
        <MapGL
            {...viewport}
            width="100%"
            height="100%"
            mapStyle="mapbox://styles/mapbox/streets-v11"
            onViewportChange={nextViewport => setViewport(nextViewport)}
            mapboxAccessToken={process.env.REACT_APP_MAPBOX_TOKEN} // Using environment variable
        >
            <Source id="population" type="geojson" data={populationDensity}>
                <Layer {...layerStyle} />
            </Source>
        </MapGL>
    );
};

export default ChoroplethMap;



