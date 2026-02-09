import React, { useState, useEffect } from 'react';
import { useSoundboardStore } from '../lib/store';
import AudioController from '../lib/AudioController';

const Grid: React.FC = () => {
  const {
    sounds,
    currentPage,
    monitorDevice,
    outputDevice,
    addSound,
    toggleLoop,
    setPlaybackMode,
    resetAllLoops,
    playSound,
  } = useSoundboardStore();
  const [draggedOverCell, setDraggedOverCell] = useState<number | null>(null);

  useEffect(() => {
    window.api.onPanic(() => {
      AudioController.stopAllSounds();
      resetAllLoops();
    });

    window.api.onPlaySound((soundId) => {
      playSound(soundId);
      const page = Math.floor(soundId / 9);
      const sound = sounds[page]?.find((s) => s.id === soundId);
      if (sound) {
        handleClick(sound);
      }
    });
  }, [resetAllLoops, playSound, sounds]);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, cellIndex: number) => {
    e.preventDefault();
    setDraggedOverCell(null);
    const files = Array.from(e.dataTransfer.files);
    const file = files[0];

    if (file && file.type === 'audio/mpeg') {
      const newPath = await window.api.saveFile(file.path);
      const sound = {
        id: currentPage * 9 + cellIndex,
        name: file.name.replace('.mp3', ''),
        filePath: newPath,
      };
      addSound(sound);
    }
  };

  const handleDragEnter = (cellIndex: number) => {
    setDraggedOverCell(cellIndex);
  };

  const handleDragLeave = () => {
    setDraggedOverCell(null);
  };

  const handleClick = (sound: any) => {
    if (sound) {
      if (sound.playbackMode === 'loop') {
        toggleLoop(sound.id);
      }
      AudioController.playSound(sound, monitorDevice, outputDevice, () => {
        if (sound.playbackMode === 'loop') {
          toggleLoop(sound.id);
        }
      });
    }
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>, sound: any) => {
    e.preventDefault();
    if (sound) {
      const newMode = sound.playbackMode === 'one-shot' ? 'loop' : 'one-shot';
      setPlaybackMode(sound.id, newMode);
    }
  };

  const pageSounds = sounds[currentPage] || [];

  return (
    <div className="grid grid-cols-3 gap-4 p-4">
      {Array.from({ length: 9 }).map((_, i) => {
        const sound = pageSounds.find((s) => s.id % 9 === i);
        const isDraggedOver = draggedOverCell === i;
        const isLooping = sound?.looping;

        return (
          <div
            key={i}
            onClick={() => handleClick(sound)}
            onContextMenu={(e) => handleContextMenu(e, sound)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, i)}
            onDragEnter={() => handleDragEnter(i)}
            onDragLeave={handleDragLeave}
            className={`aspect-square rounded-lg flex items-center justify-center text-white font-bold cursor-pointer ${
              isDraggedOver ? 'bg-green-500' : 'bg-gray-700'
            } ${isLooping ? 'border-4 border-blue-500' : ''}`}
          >
            <div className="flex flex-col items-center">
              <span>{sound ? sound.name : i + 1}</span>
              {sound && (
                <span className="text-xs text-gray-400 mt-1">{sound.playbackMode}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default Grid;
