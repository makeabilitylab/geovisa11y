/**
 * Utility functions for making Mapbox maps more accessible
 */

/**
 * Makes map navigation controls inaccessible to screen readers
 * @param {HTMLElement} mapContainer - The map container element
 */
export const makeNavigationControlsAccessible = (mapContainer) => {
    // Make nav control buttons inaccessible to screen readers
    const navButtons = mapContainer.getElementsByClassName('mapboxgl-ctrl-group')[0];
    if (navButtons) {
        navButtons.setAttribute('aria-hidden', 'true');
        navButtons.setAttribute('tabindex', '-1');
        const buttons = navButtons.getElementsByTagName('button');
        Array.from(buttons).forEach(button => {
            button.setAttribute('tabindex', '-1');
            button.setAttribute('aria-hidden', 'true');
        });
    }
};

/**
 * Makes fullscreen control inaccessible to screen readers
 * @param {HTMLElement} mapContainer - The map container element
 */
export const makeFullscreenControlAccessible = (mapContainer) => {
    const fullscreenButton = mapContainer.getElementsByClassName('mapboxgl-ctrl-fullscreen')[0];
    if (fullscreenButton) {
        fullscreenButton.setAttribute('aria-hidden', 'true');
        fullscreenButton.setAttribute('tabindex', '-1');
    }
};

/**
 * Makes scale control inaccessible to screen readers
 * @param {HTMLElement} mapContainer - The map container element
 */
export const makeScaleControlAccessible = (mapContainer) => {
    const scaleElement = mapContainer.getElementsByClassName('mapboxgl-ctrl-scale')[0];
    if (scaleElement) {
        scaleElement.setAttribute('aria-hidden', 'true');
    }
};

/**
 * Makes geolocate control inaccessible to screen readers
 * @param {HTMLElement} mapContainer - The map container element
 */
export const makeGeolocateControlAccessible = (mapContainer) => {
    const geolocateButton = mapContainer.getElementsByClassName('mapboxgl-ctrl-geolocate')[0];
    if (geolocateButton) {
        geolocateButton.setAttribute('aria-hidden', 'true');
        geolocateButton.setAttribute('tabindex', '-1');
    }
};

/**
 * Makes all map controls accessible by applying all accessibility functions
 * @param {HTMLElement} mapContainer - The map container element
 */
export const makeAllMapControlsAccessible = (mapContainer) => {
    makeNavigationControlsAccessible(mapContainer);
    makeFullscreenControlAccessible(mapContainer);
    makeScaleControlAccessible(mapContainer);
    makeGeolocateControlAccessible(mapContainer);
}; 