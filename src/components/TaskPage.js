import React, { useState, useEffect } from 'react';
import '../App.css';
import ChoroplethMap from './ChoroplethMap';
import Chatbot from './Chatbot';
import { logSessionEnd } from '../utils/logger';

function TaskPage() {
  const [currentDataset, setCurrentDataset] = useState('pct_tot_co');
  const [showSpatialClusters, setShowSpatialClusters] = useState(false);
  const [interactionFocus, setInteractionFocus] = useState('none'); // 'none', 'map', or 'chat'
  const [showingCounties, setShowingCounties] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const API_URL = process.env.NODE_ENV === 'production'
    ? 'https://mappie-talkie-api-245835075814.us-central1.run.app'
    : 'http://localhost:5000';

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
      }
    };
    
    window.addEventListener('keydown', globalHandler);
    return () => window.removeEventListener('keydown', globalHandler);
  }, []);


  useEffect(() => {
    if (interactionFocus === 'chat') {
      if (focus.type === 'state') {
        setAnnouncement(
          `Chat interaction enabled. Map focused on ${focus.states[0]}).`
        );
      } else {
        setAnnouncement('Chat interaction enabled. Type a question to ask MappieTalkie.');
      }
    } else if (interactionFocus === 'map') {
       // If we have a county in focus
       if (focus.county && focus.states?.length > 0) {
        setAnnouncement(
          `Map interaction enabled. Focused on ${focus.county} county in ${focus.states[0]}.`
        );
      } 
      // If we have a single state
      else if (focus?.states?.length > 0) {
        setAnnouncement(
          `Map interaction enabled. Focused on ${focus.states[0]} state.`
        );
      } 
      // No specific focus
      else {
        setAnnouncement('Map interaction enabled. Press Tab to move onto the map.');
      }
    }
  }, [interactionFocus, focus]);

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
          onAnnounce={(msg) => setAnnouncement(msg)}
          dataset={currentDataset}
          showSpatialClusters={showSpatialClusters}
          onSpatialClustersToggle={setShowSpatialClusters}
          onDatasetChange={handleDatasetChange}
          onShowingCountiesChange={handleShowingCountiesChange}
          apiUrl={API_URL}
          isMapInteractive={interactionFocus === 'map'}
          onMapClick={() => setInteractionFocus('map')}
          isTaskPage={true}
        />
      </div>
      <div className="w-1/3 h-full">
        <Chatbot
          dataset={currentDataset}
          focus={focus}
          onFocusChange={setFocus}
          onPatternQuestion={handlePatternQuestion}
          apiUrl={API_URL}
          isInputFocused={interactionFocus === 'chat'}
          onInputClick={() => setInteractionFocus('chat')}
          isTaskPage={true}
        />
      </div>
    </div>
  );
}

export default TaskPage; 