import React, { useState, useEffect } from 'react';
import { useSoundboardStore } from '../lib/store';

// Helper to check if device looks like a virtual cable
const isVirtualDevice = (label: string) => {
    const keywords = ['CABLE', 'VB-Audio', 'BlackHole', 'VoiceMeeter', 'Virtual', 'OpenSoundBoard'];
    return keywords.some(k => label.includes(k));
};

export const AudioSetupWizard: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
    const [step, setStep] = useState<'intro' | 'detect' | 'manual' | 'success'>('intro');
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [foundVirtual, setFoundVirtual] = useState<MediaDeviceInfo | null>(null);
    const [platform, setPlatform] = useState<string>('');
    const { setAudioSettings, setHasCompletedSetup, audioSettings } = useSoundboardStore();

    useEffect(() => {
        // Detect OS (roughly)
        const userAgent = navigator.userAgent;
        if (userAgent.indexOf("Win") !== -1) setPlatform('win');
        else if (userAgent.indexOf("Mac") !== -1) setPlatform('mac');
        else if (userAgent.indexOf("Linux") !== -1) setPlatform('linux');
    }, []);

    const scanDevices = async () => {
        setStep('detect');
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true }); // Request permission first
            const devs = await navigator.mediaDevices.enumerateDevices();
            const outputs = devs.filter(d => d.kind === 'audiooutput');
            setDevices(outputs);

            const virtual = outputs.find(d => isVirtualDevice(d.label));
            if (virtual) {
                setFoundVirtual(virtual);
            } else {
                setFoundVirtual(null);
            }
        } catch (e) {
            console.error("Failed to scan devices", e);
        }
    };

    const handleCreateSink = async () => {
        // @ts-ignore
        if (window.electronAPI) {
            // @ts-ignore
            const res = await window.electronAPI.invoke('create-virtual-sink');
            if (res.success) {
                alert("Virtual Sink Created! Scanning...");
                scanDevices();
            } else {
                alert("Failed: " + res.error);
            }
        }
    };

    const finish = () => {
        setHasCompletedSetup(true);
        if (onClose) onClose();
    };

    const useDevice = (deviceId: string) => {
        setAudioSettings({ outputDeviceId: deviceId });
        setStep('success');
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-[#1a1b2e] border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl relative overflow-hidden">

                {/* Header */}
                <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                        Fast Setup
                    </h2>
                    <p className="text-white/50 text-sm mt-2">
                        Let's get sound playing into your voice chat.
                    </p>
                </div>

                {/* Content */}
                <div className="space-y-4">

                    {step === 'intro' && (
                        <div className="text-center space-y-4">
                            <p className="text-white/80">
                                OpenSoundBoard needs a <b>Virtual Audio Device</b> to route sound to apps like Discord, Teams, or OBS.
                            </p>
                            <button onClick={scanDevices} className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 font-semibold transition-colors">
                                Scan for Devices
                            </button>
                        </div>
                    )}

                    {step === 'detect' && (
                        <div className="space-y-4">
                            {foundVirtual ? (
                                <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-xl text-center">
                                    <div className="text-green-400 font-bold mb-1">Device Found!</div>
                                    <div className="text-white/90 text-lg mb-4">{foundVirtual.label}</div>
                                    <button onClick={() => useDevice(foundVirtual.deviceId)} className="w-full py-2 bg-green-600 hover:bg-green-500 rounded-lg font-semibold">
                                        Use This Device
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="bg-orange-500/10 border border-orange-500/20 p-4 rounded-xl text-center">
                                        <div className="text-orange-400 font-bold">No Virtual Device Found</div>
                                    </div>

                                    {platform === 'win' && (
                                        <div className="text-center text-sm text-white/70">
                                            Please install <b>VB-Cable</b> (Simples & Free).
                                            <a href="https://vb-audio.com/Cable/" target="_blank" className="block mt-2 text-violet-400 hover:underline">Download VB-Cable</a>
                                        </div>
                                    )}

                                    {platform === 'mac' && (
                                        <div className="text-center text-sm text-white/70">
                                            Please install <b>BlackHole</b>.
                                            <a href="https://github.com/ExistentialAudio/BlackHole" target="_blank" className="block mt-2 text-violet-400 hover:underline">Download BlackHole</a>
                                        </div>
                                    )}

                                    {platform === 'linux' && (
                                        <div className="text-center">
                                            <button onClick={handleCreateSink} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm">
                                                Create PulseAudio Sink (Experimental)
                                            </button>
                                        </div>
                                    )}

                                    <div className="flex gap-2">
                                        <button onClick={scanDevices} className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm">
                                            Scan Again
                                        </button>
                                        <button onClick={() => setStep('manual')} className="flex-1 py-2 bg-transparent border border-white/10 hover:bg-white/5 rounded-lg text-sm">
                                            I'll do it later
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="text-center space-y-4 py-4">
                            <div className="w-16 h-16 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center mx-auto text-3xl">
                                ✓
                            </div>
                            <h3 className="text-xl font-bold">All Set!</h3>
                            <p className="text-white/60 text-sm">
                                Don't forget to select <b>"{audioSettings.outputDeviceId ? 'Your Virtual Device' : 'Default'}"</b> as your Microphone in Discord/Teams!
                            </p>
                            <button onClick={finish} className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 font-semibold transition-colors">
                                Let's Go!
                            </button>
                        </div>
                    )}

                    {step === 'manual' && (
                        <div className="text-center space-y-4">
                            <p className="text-white/60 text-sm">
                                You can always configure your audio verification later in <b>Settings</b>.
                            </p>
                            <button onClick={finish} className="w-full py-3 rounded-xl bg-slate-700 hover:bg-slate-600 font-semibold transition-colors">
                                Close Wizard
                            </button>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};
