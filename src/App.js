import React, { useState, useEffect } from 'react';
import './App.css';
import ChoroplethMap from './components/ChoroplethMap';
import Chatbot from './components/Chatbot';

function App() {
  const [currentDataset, setCurrentDataset] = useState('ppl_densit');
  const [showSpatialClusters, setShowSpatialClusters] = useState(false);
  const [focusedState, setFocusedState] = useState(null);
  const [focusedCounty, setFocusedCounty] = useState(null);
  const [isInputFocused, setIsInputFocused] = useState(false);

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
    setFocusedState(stateName);
    setFocusedCounty(null);
  };

  const handleChatbotFocus = (stateName) => {
    console.log('Setting focus via Chatbot:', stateName);
    // Clear county focus first
    setFocusedCounty(null);
    // Then set state focus
    setFocusedState(stateName);
  };

  const handleStateFocus = (stateName) => {
    // // Normalize the state name to handle arrays
    // const normalizedStateName = Array.isArray(stateName) ? stateName[0] : stateName;
    // const currentNormalizedState = Array.isArray(focusedState) ? focusedState[0] : focusedState;

    // // Only update if the value is actually different
    // if (normalizedStateName !== currentNormalizedState) {
    //   console.log('Setting focus via map:', normalizedStateName);
    //   setFocusedState(normalizedStateName);
    //   setFocusedCounty(null);
    // }
    console.log('Setting focus via map:', stateName);
    setFocusedState(stateName);
    setFocusedCounty(null);
  };

  useEffect(() => {
    const globalHandler = (e) => {
        if (e.ctrlKey && e.key.toLowerCase() === 't') {
            console.log('Global Ctrl+T caught');
        }
    };
    
    window.addEventListener('keydown', globalHandler);
    return () => window.removeEventListener('keydown', globalHandler);
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
          isDisabled={isInputFocused}
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
          apiUrl={API_URL}
          onInputFocusChange={setIsInputFocused}
        />
      </div>
    </div>
  );
}

export default App;

