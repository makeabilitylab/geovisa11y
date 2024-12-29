import React from 'react';
import Chatbot from './Chatbot';
import ChoroplethMap from './ChoroplethMap';

const Layout = () => {
    return (
        <div className="flex h-screen w-full">

            {/* Map section - 3/4 width */}
            <div className="w-3/4 h-full">
                <ChoroplethMap />
            </div>

            {/* Chatbot section - 1/4 width */}
            <div className="w-1/4 h-full bg-gray-50 border-r border-gray-200">
                <Chatbot />
            </div>
            
        </div>
    );
};

export default Layout;
