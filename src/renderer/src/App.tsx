import React, { useState, useEffect } from 'react';
import Grid from './components/Grid';
import Settings from './components/Settings';
import { useSoundboardStore } from './lib/store';

function App() {
  const { currentPage, nextPage, prevPage, sounds } = useSoundboardStore();
  const [view, setView] = useState<'grid' | 'settings'>('grid');

  useEffect(() => {
    window.api.onGetSounds(() => {
      window.api.sendSounds(sounds);
    });
  }, [sounds]);

  return (
    <div className="bg-gray-800 min-h-screen flex flex-col items-center justify-center">
      <div className="absolute top-4 right-4">
        <button onClick={() => setView(view === 'grid' ? 'settings' : 'grid')} className="px-4 py-2 bg-gray-600 rounded">
          {view === 'grid' ? 'Settings' : 'Grid'}
        </button>
      </div>
      {view === 'grid' ? (
        <>
          <div className="flex items-center space-x-4 mb-4">
            <button onClick={prevPage} className="px-4 py-2 bg-gray-600 rounded">
              Prev
            </button>
            <span className="text-xl">Page {currentPage + 1}</span>
            <button onClick={nextPage} className="px-4 py-2 bg-gray-600 rounded">
              Next
            </button>
          </div>
          <Grid />
        </>
      ) : (
        <Settings />
      )}
    </div>
  );
}

export default App;
