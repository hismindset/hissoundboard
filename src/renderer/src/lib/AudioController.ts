interface Sound {
  id: number;
  name: string;
  filePath: string;
  playbackMode: 'one-shot' | 'loop';
  looping?: boolean;
}

class AudioController {
  private playingSounds: Map<number, HTMLAudioElement[]> = new Map();

  playSound(
    sound: Sound,
    monitorDeviceId: string | null,
    outputDeviceId: string | null,
    onEnd: () => void
  ) {
    if (this.playingSounds.has(sound.id)) {
      this.playingSounds.get(sound.id)?.forEach((audio) => {
        audio.pause();
      });
      this.playingSounds.delete(sound.id);
      onEnd();
      return;
    }

    const monitorAudio = new Audio(sound.filePath);
    const outputAudio = new Audio(sound.filePath);

    const playPromise1 = (monitorAudio as any)
      .setSinkId(monitorDeviceId || '')
      .then(() => {
        monitorAudio.play();
      });

    const playPromise2 = (outputAudio as any)
      .setSinkId(outputDeviceId || '')
      .then(() => {
        outputAudio.play();
      });

    if (sound.playbackMode === 'loop') {
      monitorAudio.loop = true;
      outputAudio.loop = true;
      this.playingSounds.set(sound.id, [monitorAudio, outputAudio]);
    } else {
      Promise.all([playPromise1, playPromise2]).then(() => {
        onEnd();
      });
    }
  }

  stopAllSounds() {
    this.playingSounds.forEach((audios) => {
      audios.forEach((audio) => {
        audio.pause();
      });
    });
    this.playingSounds.clear();
  }
}

export default new AudioController();
