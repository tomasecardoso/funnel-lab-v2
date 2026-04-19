import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import FunnelLab from './FunnelLab.jsx';
import SharedScenario from './SharedScenario.jsx';
import Login from './Login.jsx';
import RequireAuth from './RequireAuth.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Read-only public client-share route */}
        <Route path="/s/:slug" element={<SharedScenario />} />
        {/* Login */}
        <Route path="/login" element={<Login />} />
        {/* Main app — requires auth */}
        <Route path="/" element={<RequireAuth><FunnelLab /></RequireAuth>} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
