import React from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import FamilyGraph from './FamilyGraph';
import './index.css';

function App() {
  return (
    <div className="app-container">
      <ReactFlowProvider>
        <FamilyGraph />
      </ReactFlowProvider>
    </div>
  );
}

export default App;
