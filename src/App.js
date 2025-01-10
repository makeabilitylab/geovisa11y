import React, { useState } from 'react';
import Layout from './components/Layout';
import './App.css';
import ChoroplethMap from './components/ChoroplethMap';
import Chatbot from './components/Chatbot';

function App() {
  const [selectedStates, setSelectedStates] = useState([]);
  const [showSpatialClusters, setShowSpatialClusters] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState('ppl_densit');

  const handleStateClick = (stateId, stateName) => {
    setSelectedStates(prev => {
      // Check if state is already in the array
      const stateIndex = prev.findIndex(state => state.id === stateId);
      
      if (stateIndex >= 0) {
        // If state exists, remove it by filtering
        return prev.filter(state => state.id !== stateId);
      } else {
        // If state doesn't exist, add it
        return [...prev, { id: stateId, name: stateName }];
      }
    });
  };

  const handleStateRemove = (stateId) => {
    setSelectedStates(prev => prev.filter(state => state.id !== stateId));
  };

  const handleSpatialClustersChange = (show) => {
    setShowSpatialClusters(show);
  };

  const handleDatasetChange = (dataset) => {
    setSelectedDataset(dataset);
  };

  const handleClearAllStates = () => {
    setSelectedStates([]);
  };

  return (
    <div className="flex h-screen">
      <div className="w-2/3 h-full">
        <ChoroplethMap
          onStateClick={handleStateClick}
          selectedStates={selectedStates}
          showSpatialClusters={showSpatialClusters}
          onSpatialClustersToggle={setShowSpatialClusters}
          onDatasetChange={handleDatasetChange}
        />
      </div>
      <div className="w-1/3 h-full p-4">
        <Chatbot
          selectedStates={selectedStates}
          onStateRemove={handleStateRemove}
          onSpatialClustersChange={handleSpatialClustersChange}
          showSpatialClusters={showSpatialClusters}
          currentDataset={selectedDataset}
          onClearAllStates={handleClearAllStates}
        />
      </div>
    </div>
  );
}

export default App;

