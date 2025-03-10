import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import TaskPage from './components/TaskPage';
import TaskPage2 from './components/TaskPage2';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Router>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/task1" element={<TaskPage />} />
        <Route path="/task2" element={<TaskPage2 />} />
      </Routes>
    </Router>
  </React.StrictMode>
);
