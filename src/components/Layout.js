import React from 'react';
import Chatbot from './Chatbot';
import ChoroplethMap from './ChoroplethMap';

const Layout = () => {
    return (
        <div style={{ display: 'flex', height: '100vh' }}>
            <div style={{ flex: 1, maxWidth: '25%', borderRight: '1px solid #ddd' }}>
                <Chatbot />
            </div>
            <div style={{ flex: 3 }}>
                <ChoroplethMap />
            </div>
        </div>
    );
};

export default Layout;
