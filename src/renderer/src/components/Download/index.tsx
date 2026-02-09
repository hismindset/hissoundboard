import React, { useState } from 'react';

const Download: React.FC = () => {
  const [url, setUrl] = useState('');

  const handleDownload = () => {
    if (url) {
      window.api.downloadFile(url);
    }
  };

  return (
    <div className="flex space-x-2">
      <input
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Enter URL to download"
        className="w-full p-2 bg-gray-700 rounded"
      />
      <button onClick={handleDownload} className="px-4 py-2 bg-blue-600 rounded">
        Download
      </button>
    </div>
  );
};

export default Download;