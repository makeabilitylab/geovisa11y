import React, { useState } from 'react';
import Layout from './components/Layout';
import './App.css';
import ChoroplethMap from './components/ChoroplethMap';
import Chatbot from './components/Chatbot';

function App() {
  const [currentDataset, setCurrentDataset] = useState('ppl_densit');
  const [showSpatialClusters, setShowSpatialClusters] = useState(false);
  const [focusedState, setFocusedState] = useState(null);

  const handleDatasetChange = (dataset) => {
    setCurrentDataset(dataset);
  };

  const handlePatternQuestion = (show) => {
    setShowSpatialClusters(show);
  };

  const handleStateQuestion = (stateName) => {
    setFocusedState(stateName);
  };

  return (
    <div className="flex h-screen">
      <div className="w-2/3 h-full">
        <ChoroplethMap
          dataset={currentDataset}
          showSpatialClusters={showSpatialClusters}
          onSpatialClustersToggle={setShowSpatialClusters}
          onDatasetChange={handleDatasetChange}
          focusedState={focusedState}
        />
      </div>
      <div className="w-1/3 h-full">
        <Chatbot
          dataset={currentDataset}
          onPatternQuestion={handlePatternQuestion}
          onStateQuestion={handleStateQuestion}
        />
      </div>
    </div>
  );
}

export default App;

