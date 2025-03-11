import React, { useState, useEffect } from 'react';
import './App.css';
import ChoroplethMap from './components/ChoroplethMap';
import Chatbot from './components/Chatbot';
import { logSessionEnd } from './utils/logger';

function App() {
  const [currentDataset, setCurrentDataset] = useState('ppl_densit');
  const [showSpatialClusters, setShowSpatialClusters] = useState(false);
  const [interactionFocus, setInteractionFocus] = useState('none'); // 'none', 'map', or 'chat'
  const [showingCounties, setShowingCounties] = useState(false);

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

  const [focus, setFocus] = useState({
    type: null,     
    states: [],        
    county: null,      
    city: null,        
    highlightOnly: false
  });

  function handleFocusChange(newFocus) {
    setFocus(newFocus);
  }

  const handleShowingCountiesChange = (showing) => {
    setShowingCounties(showing);
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
        console.log('Interaction focus changed to:', interactionFocus);
      }
    };
    window.addEventListener('keydown', globalHandler);
    return () => window.removeEventListener('keydown', globalHandler);
  }, []);


  useEffect(() => {
    console.log('Interaction focus changed to:', interactionFocus);
  }, [interactionFocus]);

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
          focus={focus}
          onFocusChange={handleFocusChange}
          dataset={currentDataset}
          showSpatialClusters={showSpatialClusters}
          onSpatialClustersToggle={setShowSpatialClusters}
          onDatasetChange={handleDatasetChange}
          apiUrl={API_URL}
          isMapInteractive={interactionFocus === 'map'}
          onMapClick={() => setInteractionFocus('map')}
          showingCounties={showingCounties}
          onShowingCountiesChange={handleShowingCountiesChange}
        />
      </div>
      <div className="w-1/3 h-full">
        <Chatbot
          focus={focus}
          onFocusChange={handleFocusChange}
          dataset={currentDataset}
          onPatternQuestion={handlePatternQuestion}
          apiUrl={API_URL}
          isInputFocused={interactionFocus === 'chat'}
          onInputClick={() => setInteractionFocus('chat')}
          showingCounties={showingCounties}
        />
      </div>
    </div>
  );
}

export default App;

