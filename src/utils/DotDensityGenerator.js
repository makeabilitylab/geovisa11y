import * as turf from '@turf/turf';

/**
 * Generates random points within a polygon based on a value
 * @param {Object} feature - GeoJSON feature with polygon geometry
 * @param {number} value - The value to determine number of dots
 * @param {number} dotValue - Value represented by each dot (e.g., 10000 for 1 dot = 10,000 households)
 * @returns {Array} Array of point features
 */
export const generateDotDensity = (feature, value, dotValue = 10000) => {
  if (!feature || !feature.geometry) {
    console.error('Invalid feature:', feature);
    return [];
  }

  // Calculate number of dots based on value and dotValue
  const numDots = Math.round(value / dotValue);
  
  // Generate random points within the polygon
  const points = [];
  const bbox = turf.bbox(feature);
  
  // Create a polygon from the feature for point-in-polygon test
  const polygon = feature.geometry;
  
  // Generate points
  let attempts = 0;
  const maxAttempts = numDots * 10; // Limit attempts to avoid infinite loops
  
  while (points.length < numDots && attempts < maxAttempts) {
    attempts++;
    
    // Generate a random point within the bounding box
    const x = bbox[0] + Math.random() * (bbox[2] - bbox[0]);
    const y = bbox[1] + Math.random() * (bbox[3] - bbox[1]);
    const point = turf.point([x, y]);
    
    // Check if the point is inside the polygon
    if (turf.booleanPointInPolygon(point, polygon)) {
      points.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [x, y]
        },
        properties: {
          state: feature.properties.state_name,
          value: feature.properties.value
        }
      });
    }
  }
  
  return points;
};

/**
 * Generates dot density points for all features in a GeoJSON FeatureCollection
 * @param {Object} geojson - GeoJSON FeatureCollection
 * @param {number} dotValue - Value represented by each dot
 * @returns {Object} GeoJSON FeatureCollection of points
 */
export const generateDotDensityForFeatureCollection = (geojson, dotValue = 10000) => {
  if (!geojson || !geojson.features || !Array.isArray(geojson.features)) {
    console.error('Invalid GeoJSON:', geojson);
    return { type: 'FeatureCollection', features: [] };
  }
  
  const allPoints = [];
  
  geojson.features.forEach(feature => {
    if (feature.geometry.type.includes('Polygon')) {
      const value = feature.properties.value || 0;
      const points = generateDotDensity(feature, value, dotValue);
      allPoints.push(...points);
    }
  });
  
  return {
    type: 'FeatureCollection',
    features: allPoints
  };
};

/**
 * Generates dot density points for all features in a GeoJSON FeatureCollection with multiple attributes
 * @param {Object} featureCollection - GeoJSON FeatureCollection
 * @param {Object} attributeConfig - Object mapping attribute names to dot values and colors
 * @param {number} customDotValue - Custom dot value to use instead of the one from config
 * @returns {Object} GeoJSON FeatureCollection of points
 */
export const generateMultiAttributeDotDensity = (featureCollection, attributeConfig, customDotValue = null) => {
    const dotDensityPoints = {
        type: 'FeatureCollection',
        features: []
    };

    featureCollection.features.forEach(feature => {
        const properties = feature.properties;
        const geometry = feature.geometry;

        // Process each attribute (gas, electricity, oil)
        Object.keys(attributeConfig).forEach(attribute => {
            const config = attributeConfig[attribute];
            const value = properties[attribute] || 0;
            
            // Use custom dot value if provided, otherwise use the one from config
            const dotValue = customDotValue || config.dotValue;
            
            // Calculate number of dots
            const numDots = Math.round(value / dotValue);
            
            if (numDots > 0) {
                // Generate points for this attribute
                const points = generatePointsInPolygon(geometry, numDots);
                
                // Add points to the collection with attribute properties
                points.forEach(point => {
                    dotDensityPoints.features.push({
                        type: 'Feature',
                        geometry: {
                            type: 'Point',
                            coordinates: point
                        },
                        properties: {
                            attribute: attribute,
                            color: config.color,
                            state: properties.state_name,
                            county: properties.county_name || null
                        }
                    });
                });
            }
        });
    });

    return dotDensityPoints;
};

/**
 * Generates random points within a polygon
 * @param {Object} geometry - GeoJSON geometry (Polygon or MultiPolygon)
 * @param {number} numDots - Number of dots to generate
 * @returns {Array} Array of point coordinates [x, y]
 */
const generatePointsInPolygon = (geometry, numDots) => {
  if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) {
    console.error('Invalid geometry type:', geometry?.type);
    return [];
  }

  // Create a GeoJSON feature from the geometry for turf operations
  const feature = {
    type: 'Feature',
    properties: {},
    geometry: geometry
  };
  
  // Get the bounding box
  const bbox = turf.bbox(feature);
  
  // Generate points
  const points = [];
  let attempts = 0;
  const maxAttempts = numDots * 10; // Limit attempts to avoid infinite loops
  
  while (points.length < numDots && attempts < maxAttempts) {
    attempts++;
    
    // Generate a random point within the bounding box
    const x = bbox[0] + Math.random() * (bbox[2] - bbox[0]);
    const y = bbox[1] + Math.random() * (bbox[3] - bbox[1]);
    const point = turf.point([x, y]);
    
    // Check if the point is inside the polygon
    if (turf.booleanPointInPolygon(point, geometry)) {
      points.push([x, y]);
    }
  }
  
  return points;
};
