import React from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import FamilyGraph from './FamilyGraph';
import { isSupabaseConfigured } from './supabase';
import './index.css';

function MissingSupabaseConfig() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          maxWidth: '560px',
          width: '100%',
          padding: '24px',
          borderRadius: '16px',
          background: 'var(--panel-bg)',
          border: '1px solid var(--panel-border)',
          color: 'var(--text-primary)',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.18)',
        }}
      >
        <h1 style={{ margin: '0 0 12px', fontSize: '24px' }}>Supabase configuration is missing</h1>
        <p style={{ margin: '0 0 8px', color: 'var(--text-secondary)' }}>
          This app cannot start until the frontend Supabase environment variables are configured.
        </p>
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
          Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, then reload the app.
        </p>
      </div>
    </div>
  );
}

function App() {
  return (
    <div className="app-container">
      {isSupabaseConfigured ? (
        <ReactFlowProvider>
          <FamilyGraph />
        </ReactFlowProvider>
      ) : (
        <MissingSupabaseConfig />
      )}
      <Analytics />
      <SpeedInsights />
    </div>
  );
}

export default App;
