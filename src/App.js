import React, { useState, useEffect } from 'react';
import './App.css';
import ChoroplethMap from './components/ChoroplethMap';
import Chatbot from './components/Chatbot';
import { logSessionEnd } from './utils/logger';

function App() {
  const [currentDataset, setCurrentDataset] = useState('ppl_densit');
  const [showSpatialClusters, setShowSpatialClusters] = useState(false);
  const [focusedState, setFocusedState] = useState(null);
  const [focusedCounty, setFocusedCounty] = useState(null);
  const [focusedCity, setFocusedCity] = useState(null);
  const [interactionFocus, setInteractionFocus] = useState('none'); // 'none', 'map', or 'chat'

  const API_URL = process.env.NODE_ENV === 'production'
    ? 'https://mappie-talkie-api-245835075814.us-central1.run.app'
    : 'http://localhost:5000';

  // console.log('App initialization:', {
  //   nodeEnv: process.env.NODE_ENV,
  //   apiUrl: process.env.NODE_ENV === 'production' 
  //       ? 'https://mappie-talkie-api-245835075814.us-central1.run.app'
  //       : 'http://localhost:5000'
  // });

  const handleDatasetChange = (dataset) => {
    setCurrentDataset(dataset);
  };

  const handlePatternQuestion = (show) => {
    setShowSpatialClusters(show);
  };

  const handleStateQuestion = (stateName) => {
    console.log('Setting focused state:', stateName);
    setFocusedCity(null);
    setFocusedCounty(null);
    setFocusedState(stateName);
  };

  const handleChatbotFocus = (stateName) => {
    console.log('Setting focus via Chatbot:', stateName);
    // Clear other focuses
    setFocusedCity(null); 
    setFocusedCounty(null);
    // Then set state focus
    setFocusedState(stateName);
  };

  const handleStateFocus = (stateName) => {
    // Normalize the state name to handle arrays
    const normalizedStateName = Array.isArray(stateName) ? stateName[0] : stateName;
    const currentNormalizedState = Array.isArray(focusedState) ? focusedState[0] : focusedState;

    // Only update if the value is actually different
    if (normalizedStateName !== currentNormalizedState) {
        console.log('Setting focus via map:', normalizedStateName);
        setFocusedCity(null);  // Clear city focus
        setFocusedState(stateName);
        setFocusedCounty(null);
    }
  };

  const handleCityFocus = (cityInfo) => {
    // Clear other focuses
    setFocusedState(null);
    setFocusedCounty(null);
    // Set city focus
    setFocusedCity(cityInfo);
  };

  useEffect(() => {
    const globalHandler = (e) => {
      // Handle Ctrl+M to toggle between map and chat focus
      if (e.ctrlKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        console.log('Global Ctrl+M caught');
        // First, remove focus from any active element
        if (document.activeElement) {
          document.activeElement.blur();
        }
        // Toggle between map and chat
        setInteractionFocus(prev => {
          if (prev === 'map') return 'chat';
          if (prev === 'chat') return 'map';
          return 'map'; // If 'none', default to map
        });
      }
    };
    
    window.addEventListener('keydown', globalHandler);
    return () => window.removeEventListener('keydown', globalHandler);
  }, []);

  useEffect(() => {
    // Log session end when the component unmounts
    return () => {
      logSessionEnd();
    };
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <div className="w-2/3 h-full relative">
        <ChoroplethMap
          dataset={currentDataset}
          showSpatialClusters={showSpatialClusters}
          onSpatialClustersToggle={setShowSpatialClusters}
          onDatasetChange={handleDatasetChange}
          focusedState={focusedState}
          onFocusedCountyChange={setFocusedCounty}
          onStateFocus={handleStateFocus}
          apiUrl={API_URL}
          isMapInteractive={interactionFocus === 'map'}
          onMapClick={() => setInteractionFocus('map')}
          focusedCity={focusedCity}
          onCityFocus={setFocusedCity}
        />
      </div>
      <div className="w-1/3 h-full">
        <Chatbot
          dataset={currentDataset}
          onPatternQuestion={handlePatternQuestion}
          onStateQuestion={handleStateQuestion}
          onStateFocus={handleChatbotFocus}
          currentFocusedState={focusedState}
          currentFocusedCounty={focusedCounty}
          currentFocusedCity={focusedCity}
          apiUrl={API_URL}
          isInputFocused={interactionFocus === 'chat'}
          onInputClick={() => setInteractionFocus('chat')}
          onCityFocus={handleCityFocus}
        />
      </div>
    </div>
  );
}

export default App;

