import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './common.css';
import './react-overrides.css';

createRoot(document.getElementById('root')).render(<App />);
