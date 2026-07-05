import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSoundboardStore } from '../lib/store';
import { audioController } from '../lib/audioController';
import { getEffectPreset, resolveEffectParams } from '../lib/voiceEffects';

interface EffectEditorProps {
    presetId: string;
    onClose: () => void;
}

/**
 * Modal to tweak a voice effect's parameters without touching code.
 * Slider changes are committed to the store (debounced); the audio chain
 * rebuilds live, so with the effect active you hear changes immediately.
 */
const EffectEditor: React.FC<EffectEditorProps> = ({ presetId, onClose }) => {
    const preset = getEffectPreset(presetId);

    const storedParams = useSoundboardStore((s) => s.voiceEffectParams[presetId]);
    const setVoiceEffectParam = useSoundboardStore((s) => s.setVoiceEffectParam);
    const resetVoiceEffectParams = useSoundboardStore((s) => s.resetVoiceEffectParams);
    const activeVoiceEffect = useSoundboardStore((s) => s.activeVoiceEffect);
    const toggleVoiceEffect = useSoundboardStore((s) => s.toggleVoiceEffect);
    const micDeviceId = useSoundboardStore((s) => s.audioSettings?.micDeviceId || '');

    const isActive = activeVoiceEffect === presetId;

    // Local values for immediate slider feedback; store commits are debounced
    // so the audio chain doesn't rebuild on every slider tick.
    const [values, setValues] = useState<Record<string, number>>(() =>
        resolveEffectParams(presetId, storedParams)
    );
    const commitTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

    const [monitoring, setMonitoring] = useState(false);
    const [platform, setPlatform] = useState('');

    useEffect(() => {
        window.api?.getPlatform?.().then((p: string) => setPlatform(p)).catch(() => { });
    }, []);

    // Cleanup on close: stop the self-monitor. Pending debounced commits are
    // NOT cleared — they fire shortly after unmount so the last slider value
    // is never lost (store writes are safe outside React).
    useEffect(() => {
        return () => {
            audioController.stopVoiceMonitor();
        };
    }, []);

    const handleChange = useCallback((paramId: string, value: number) => {
        setValues((v) => ({ ...v, [paramId]: value }));
        clearTimeout(commitTimers.current[paramId]);
        commitTimers.current[paramId] = setTimeout(() => {
            setVoiceEffectParam(presetId, paramId, value);
        }, 150);
    }, [presetId, setVoiceEffectParam]);

    const handleReset = useCallback(() => {
        Object.values(commitTimers.current).forEach(clearTimeout);
        resetVoiceEffectParams(presetId);
        setValues(resolveEffectParams(presetId, undefined));
    }, [presetId, resetVoiceEffectParams]);

    const handleToggleMonitor = useCallback(async () => {
        if (monitoring) {
            audioController.stopVoiceMonitor();
            setMonitoring(false);
        } else {
            const ok = await audioController.startVoiceMonitor();
            setMonitoring(ok);
        }
    }, [monitoring]);

    if (!preset) return null;

    const formatValue = (v: number, step: number) =>
        step >= 1 ? String(Math.round(v)) : v.toFixed(2).replace(/\.?0+$/, '');

    // Self-monitoring needs the mic in the app graph: a selected mic on
    // Win/Mac, or an active effect on Linux (app path only runs then).
    const micAvailable = platform === 'linux' ? isActive : !!micDeviceId;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
            onClick={onClose}
        >
            <div
                className="bg-surface-900 border border-surface-600/50 rounded-2xl p-5 w-[420px] max-w-[90vw] shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between mb-1">
                    <h3 className="text-base font-bold text-white/90 flex items-center gap-2">
                        <span className="text-xl">{preset.emoji}</span>
                        {preset.name}
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-lg text-surface-400 hover:text-white hover:bg-surface-700 transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <p className="text-xs text-surface-400 mb-4">{preset.description}</p>

                {/* Sliders */}
                <div className="space-y-3">
                    {preset.params.map((param) => (
                        <div key={param.id}>
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-xs font-medium text-surface-300">{param.label}</label>
                                <span className="text-xs font-mono text-accent-light">
                                    {formatValue(values[param.id] ?? param.default, param.step)}
                                    {param.unit ? ` ${param.unit}` : ''}
                                </span>
                            </div>
                            <input
                                type="range"
                                min={param.min}
                                max={param.max}
                                step={param.step}
                                value={values[param.id] ?? param.default}
                                onChange={(e) => handleChange(param.id, Number(e.target.value))}
                                className="w-full h-1.5 rounded-full appearance-none bg-surface-700 accent-accent cursor-pointer"
                            />
                        </div>
                    ))}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-5">
                    <button
                        onClick={() => toggleVoiceEffect(presetId)}
                        className={`flex-1 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200 ${isActive
                            ? 'bg-accent text-white shadow-glow-purple'
                            : 'bg-surface-800 text-surface-300 hover:bg-surface-700 hover:text-white'
                            }`}
                    >
                        {isActive ? '● Effekt aktiv' : '○ Effekt aktivieren'}
                    </button>
                    <button
                        onClick={handleToggleMonitor}
                        disabled={!micAvailable}
                        title={
                            !micAvailable
                                ? (platform === 'linux'
                                    ? 'Zum Abhören zuerst den Effekt aktivieren'
                                    : 'Zum Abhören zuerst ein Mikrofon in den Einstellungen wählen')
                                : 'Eigene (verzerrte) Stimme auf dem Monitor-Gerät abhören'
                        }
                        className={`flex-1 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200 ${!micAvailable
                            ? 'bg-surface-800/50 text-surface-600 cursor-not-allowed'
                            : monitoring
                                ? 'bg-neon-green/20 text-neon-green'
                                : 'bg-surface-800 text-surface-300 hover:bg-surface-700 hover:text-white'
                            }`}
                    >
                        {monitoring ? '🎧 Abhören an' : '🎧 Abhören'}
                    </button>
                    <button
                        onClick={handleReset}
                        title="Alle Regler auf Standardwerte zurücksetzen"
                        className="px-3 py-2 rounded-xl text-xs font-medium bg-surface-800 text-surface-300 hover:bg-surface-700 hover:text-white transition-all duration-200"
                    >
                        ↺ Reset
                    </button>
                </div>

                {monitoring && (
                    <p className="text-[10px] text-yellow-500/80 mt-2">
                        ⚠ Kopfhörer verwenden — über Lautsprecher entsteht eine Rückkopplung.
                    </p>
                )}
            </div>
        </div>
    );
};

export default EffectEditor;
