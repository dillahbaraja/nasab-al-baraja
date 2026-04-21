import React from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import FamilyGraph from './FamilyGraph';
import './index.css';

function App() {
  return (
    <div className="app-container">
      <ReactFlowProvider>
        <FamilyGraph />
      </ReactFlowProvider>
      <Analytics />
      <SpeedInsights />
    </div>
  );
}

export default App;
