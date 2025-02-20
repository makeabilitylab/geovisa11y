import React, { useState } from 'react';
import Chatbot from './Chatbot';
import ChoroplethMap from './ChoroplethMap';

const Layout = () => {
    const [selectedStates, setSelectedStates] = useState([]);

    const handleStateClick = (stateId, stateName) => {
        setSelectedStates(prev => {
            const stateExists = prev.find(state => state.id === stateId);
            if (stateExists) {
                return prev.filter(state => state.id !== stateId);
            }
            return [...prev, { id: stateId, name: stateName }];
        });
    };

    const handleStateRemove = (stateId) => {
        setSelectedStates(prev => prev.filter(state => state.id !== stateId));
    };

    return (
        <div className="flex h-screen w-full">
            {/* Map section - 3/4 width */}
            <div className="w-3/4 h-full" tabIndex="-1" aria-hidden="true">
                <ChoroplethMap 
                    onStateClick={handleStateClick}
                    selectedStates={selectedStates}
                />
            </div>

            {/* Chatbot section - 1/4 width */}
            <div className="w-1/4 h-full bg-gray-50 border-r border-gray-200" tabIndex="0">
                <Chatbot 
                    selectedStates={selectedStates} 
                    onStateRemove={handleStateRemove}
                />
            </div>
        </div>
    );
};

export default Layout;
