import React, { useState, useEffect } from 'react';
import './App.css';
import ChoroplethMap from './components/ChoroplethMap';
import Chatbot from './components/Chatbot';
import { logSessionEnd } from './utils/logger';
import { APP_CONFIG } from './config/appConfig';

function App() {
  const [currentDataset, setCurrentDataset] = useState('ppl_densit');
  const [showSpatialClusters, setShowSpatialClusters] = useState(false);
  const [interactionFocus, setInteractionFocus] = useState('none'); // 'none', 'map', or 'chat'
  const [showingCounties, setShowingCounties] = useState(false);
  const [announcement, setAnnouncement] = useState('');

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
        console.log('Interaction focus1', interactionFocus);
      }
    };
    window.addEventListener('keydown', globalHandler);
    return () => window.removeEventListener('keydown', globalHandler);
  }, []);


  useEffect(() => {
    if (interactionFocus === 'chat') {
      if (focus.type === 'state') {
        setAnnouncement(
          `Chat interaction enabled. Map focused on ${focus.states[0]}.`
        );
      } else {
        setAnnouncement(`Chat interaction enabled. Type a question to ask ${APP_CONFIG.name}.`);
      }
    } else if (interactionFocus === 'map') {
      // If we have a noNeighbor property, announce that first and return early
      if (focus.noNeighbor) {
        if (focus.county) {
          setAnnouncement(
            `There is no county ${focus.noNeighbor} of ${focus.county}`
          );
        } else {
          setAnnouncement(
            `There is no state ${focus.noNeighbor} of ${focus.states[0]}`
          );
        }
        return;
      }
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
    <div className="flex h-screen w-screen overflow-hidden" role="presentation">
      <div className="w-2/3 h-full relative" role="presentation">
        <ChoroplethMap
          focus={focus}
          onFocusChange={handleFocusChange}
          onAnnounce={(msg) => setAnnouncement(msg)}
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
        <div
        role="status"
        aria-live="assertive"
        aria-atomic="true"
        className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white p-4 rounded-lg shadow-lg"
        >
          {announcement}
        </div>
      </div>
      <div className="w-1/3 h-full" role="presentation">
        <Chatbot
          focus={focus}
          onFocusChange={handleFocusChange}
          onAnnounce={(msg) => setAnnouncement(msg)}
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

