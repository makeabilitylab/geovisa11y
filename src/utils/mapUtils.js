import { useCallback } from 'react';

export const useMapLayers = (map) => {
    const toggleLayerVisibility = useCallback((layerId, isVisible) => {
        if (!map.current || !map.current.getStyle()) return;
        
        if (map.current.getLayer(layerId)) {
            map.current.setLayoutProperty(
                layerId, 
                'visibility', 
                isVisible ? 'visible' : 'none'
            );
        }
    }, [map]);

    const toggleLayerSet = useCallback((layerConfig, isVisible) => {
        if (!map.current) return;
        
        layerConfig.forEach(layerId => {
            toggleLayerVisibility(layerId, isVisible);
        });
    }, [toggleLayerVisibility]);

    const layerExists = useCallback((layerId) => {
        return map.current && map.current.getLayer(layerId);
    }, [map]);

    const sourceExists = useCallback((sourceId) => {
        return map.current && map.current.getSource(sourceId);
    }, [map]);

    const removeLayersSafely = useCallback((layerIds) => {
        if (!map.current) return;
        
        layerIds.forEach(layerId => {
            if (layerExists(layerId)) {
                map.current.removeLayer(layerId);
            }
        });
    }, [layerExists, map]);

    const removeSourceSafely = useCallback((sourceId) => {
        if (!map.current) return;
        
        if (sourceExists(sourceId)) {
            map.current.removeSource(sourceId);
        }
    }, [sourceExists, map]);

    return {
        toggleLayerVisibility,
        toggleLayerSet,
        layerExists,
        sourceExists,
        removeLayersSafely,
        removeSourceSafely
    };
}; 