import React, { useState } from 'react';
import './App.css';
import ChoroplethMap from './components/ChoroplethMap';
import Chatbot from './components/Chatbot';

function App() {
  const [currentDataset, setCurrentDataset] = useState('ppl_densit');
  const [showSpatialClusters, setShowSpatialClusters] = useState(false);
  const [focusedState, setFocusedState] = useState(null);
  const [focusedCounty, setFocusedCounty] = useState(null);

  const API_URL = process.env.NODE_ENV === 'production'
    ? 'https://mappie-talkie-api-245835075814.us-central1.run.app'
    : 'http://localhost:5000';

  console.log('App initialization:', {
    nodeEnv: process.env.NODE_ENV,
    apiUrl: process.env.NODE_ENV === 'production' 
        ? 'https://mappie-talkie-api-245835075814.us-central1.run.app'
        : 'http://localhost:5000'
  });

  const handleDatasetChange = (dataset) => {
    setCurrentDataset(dataset);
  };

  const handlePatternQuestion = (show) => {
    setShowSpatialClusters(show);
  };

  const handleStateQuestion = (stateName) => {
    console.log('Setting focused state:', stateName);
    setFocusedState(stateName);
  };

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
          onStateFocus={setFocusedState}
          apiUrl={API_URL}
        />
      </div>
      <div className="w-1/3 h-full">
        <Chatbot
          dataset={currentDataset}
          onPatternQuestion={handlePatternQuestion}
          onStateQuestion={handleStateQuestion}
          onStateFocus={(stateName) => {
            console.log('Setting focus via Chatbot:', stateName);
            setFocusedState(stateName);
          }}
          currentFocusedState={focusedState}
          currentFocusedCounty={focusedCounty}
          apiUrl={API_URL}
        />
      </div>
    </div>
  );
}

export default App;

