/**
 * Voice-changer effect presets for the microphone passthrough.
 *
 * Each preset builds a small Web Audio graph that the AudioController wires
 * between the mic source and the mic gain (mic → effect → gain → output).
 * Only standard nodes are used (no AudioWorklet), so the chains work in any
 * Electron build without extra bundling steps.
 *
 * Grid integration: a grid slot may hold `effect:<presetId>` instead of a
 * sound id. Those slots toggle the effect instead of playing a sound, which
 * makes the existing global shortcuts / remote triggers work for effects too.
 */

export const VOICE_EFFECT_PREFIX = 'effect:';

/** One user-editable knob of a preset (rendered as a slider in the editor). */
export interface VoiceEffectParamDef {
    id: string;
    label: string;
    min: number;
    max: number;
    step: number;
    default: number;
    unit?: string;
}

export interface VoiceEffectPreset {
    id: string;
    name: string;
    emoji: string;
    description: string;
    params: VoiceEffectParamDef[];
}

export const VOICE_EFFECT_PRESETS: VoiceEffectPreset[] = [
    {
        id: 'robot', name: 'Roboter', emoji: '🤖', description: 'Ringmodulator – klassische Roboterstimme',
        params: [
            { id: 'frequency', label: 'Modulation', min: 10, max: 300, step: 1, default: 50, unit: 'Hz' },
            { id: 'distortion', label: 'Verzerrung', min: 0, max: 10, step: 0.5, default: 2 },
        ],
    },
    {
        id: 'deep', name: 'Tief', emoji: '🐻', description: 'Stimme nach unten gepitcht',
        params: [
            { id: 'semitones', label: 'Tonhöhe', min: -12, max: -1, step: 1, default: -5, unit: 'HT' },
        ],
    },
    {
        id: 'high', name: 'Hoch', emoji: '🐿️', description: 'Stimme nach oben gepitcht',
        params: [
            { id: 'semitones', label: 'Tonhöhe', min: 1, max: 12, step: 1, default: 5, unit: 'HT' },
        ],
    },
    {
        id: 'cathedral', name: 'Kirche', emoji: '⛪', description: 'Großer Hall wie in einer Kathedrale',
        params: [
            { id: 'duration', label: 'Hallzeit', min: 0.5, max: 6, step: 0.1, default: 2.8, unit: 's' },
            { id: 'decay', label: 'Abklingen', min: 1, max: 8, step: 0.1, default: 3.5 },
            { id: 'wet', label: 'Hall-Anteil', min: 0, max: 1.5, step: 0.05, default: 0.85 },
            { id: 'dry', label: 'Direktsignal', min: 0, max: 1, step: 0.05, default: 0.6 },
        ],
    },
    {
        id: 'chorus', name: 'Chor', emoji: '🎶', description: 'Mehrstimmiger Chorus-Effekt',
        params: [
            { id: 'rate', label: 'Geschwindigkeit', min: 0.25, max: 3, step: 0.05, default: 1, unit: '×' },
            { id: 'depth', label: 'Tiefe', min: 0.25, max: 3, step: 0.05, default: 1, unit: '×' },
            { id: 'mix', label: 'Stimmen-Anteil', min: 0, max: 1, step: 0.05, default: 0.45 },
        ],
    },
    {
        id: 'megaphone', name: 'Megafon', emoji: '📣', description: 'Verzerrtes, blechernes Megafon',
        params: [
            { id: 'highpass', label: 'Tiefen-Filter', min: 100, max: 1500, step: 10, default: 500, unit: 'Hz' },
            { id: 'lowpass', label: 'Höhen-Filter', min: 1000, max: 8000, step: 50, default: 3200, unit: 'Hz' },
            { id: 'distortion', label: 'Verzerrung', min: 0, max: 20, step: 0.5, default: 8 },
        ],
    },
];

/**
 * Merge stored overrides with the preset defaults, clamped to each param's
 * range. Always returns a complete param record for the preset.
 */
export const resolveEffectParams = (
    presetId: string,
    overrides?: Record<string, number>
): Record<string, number> => {
    const preset = getEffectPreset(presetId);
    const out: Record<string, number> = {};
    preset?.params.forEach((p) => {
        const v = overrides?.[p.id];
        out[p.id] = typeof v === 'number' && Number.isFinite(v)
            ? Math.min(p.max, Math.max(p.min, v))
            : p.default;
    });
    return out;
};

/** True if a grid slot value references a voice effect instead of a sound. */
export const isEffectSlotId = (value: string | null | undefined): value is string =>
    !!value && value.startsWith(VOICE_EFFECT_PREFIX);

/** Grid slot value for a preset ("effect:<id>"). */
export const effectSlotId = (presetId: string) => `${VOICE_EFFECT_PREFIX}${presetId}`;

/** Look up a preset by its id or by a grid slot value ("effect:<id>"). */
export const getEffectPreset = (idOrSlotId: string): VoiceEffectPreset | undefined => {
    const id = idOrSlotId.startsWith(VOICE_EFFECT_PREFIX)
        ? idOrSlotId.slice(VOICE_EFFECT_PREFIX.length)
        : idOrSlotId;
    return VOICE_EFFECT_PRESETS.find((p) => p.id === id);
};

export interface VoiceEffectChain {
    input: AudioNode;
    output: AudioNode;
    dispose: () => void;
}

type StoppableSource = AudioBufferSourceNode | OscillatorNode;

const makeChain = (
    input: AudioNode,
    output: AudioNode,
    nodes: AudioNode[],
    sources: StoppableSource[]
): VoiceEffectChain => ({
    input,
    output,
    dispose: () => {
        sources.forEach((s) => {
            try { s.stop(); } catch { /* already stopped */ }
        });
        [input, output, ...nodes, ...sources].forEach((n) => {
            try { n.disconnect(); } catch { /* already disconnected */ }
        });
    },
});

/** Soft-clipping curve for the distortion-based presets. */
const distortionCurve = (amount: number): Float32Array<ArrayBuffer> => {
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
    }
    return curve;
};

/**
 * Granular pitch shifter built from two crossfaded, sawtooth-modulated delay
 * lines (the classic "Jungle" technique). A linearly ramping delay time plays
 * the signal back slower/faster; two voices offset by half a period with a
 * sin² crossfade hide the sawtooth wrap-around.
 */
const buildPitchShift = (ctx: AudioContext, semitones: number): VoiceEffectChain => {
    const input = ctx.createGain();
    const output = ctx.createGain();

    const ratio = Math.pow(2, semitones / 12);
    const period = 0.12; // grain period in seconds
    const depth = Math.abs(1 - ratio) * period; // delay sweep amplitude
    const rampUp = ratio < 1; // growing delay ⇒ lower pitch

    const len = Math.round(period * ctx.sampleRate);
    const rampBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const fadeBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ramp = rampBuf.getChannelData(0);
    const fade = fadeBuf.getChannelData(0);
    for (let i = 0; i < len; i++) {
        const t = i / len;
        ramp[i] = rampUp ? t : 1 - t;
        const s = Math.sin(Math.PI * t);
        fade[i] = s * s; // zero exactly at the sawtooth wrap points
    }

    const nodes: AudioNode[] = [];
    const sources: StoppableSource[] = [];
    const startAt = ctx.currentTime + 0.05;

    const makeVoice = (bufferOffset: number) => {
        const delay = ctx.createDelay(1);
        delay.delayTime.value = 0.005;
        const depthGain = ctx.createGain();
        depthGain.gain.value = depth;
        const fadeGain = ctx.createGain();
        fadeGain.gain.value = 0;

        const rampSrc = ctx.createBufferSource();
        rampSrc.buffer = rampBuf;
        rampSrc.loop = true;
        rampSrc.connect(depthGain);
        depthGain.connect(delay.delayTime);

        const fadeSrc = ctx.createBufferSource();
        fadeSrc.buffer = fadeBuf;
        fadeSrc.loop = true;
        fadeSrc.connect(fadeGain.gain);

        input.connect(delay);
        delay.connect(fadeGain);
        fadeGain.connect(output);

        rampSrc.start(startAt, bufferOffset);
        fadeSrc.start(startAt, bufferOffset);

        nodes.push(delay, depthGain, fadeGain);
        sources.push(rampSrc, fadeSrc);
    };

    makeVoice(0);
    makeVoice(period / 2);

    return makeChain(input, output, nodes, sources);
};

const buildRobot = (ctx: AudioContext, p: Record<string, number>): VoiceEffectChain => {
    const input = ctx.createGain();
    const output = ctx.createGain();

    // Ring modulator: multiply the voice with a low-frequency sine carrier.
    const ring = ctx.createGain();
    ring.gain.value = 0;
    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = p.frequency;
    carrier.connect(ring.gain);

    const shaper = ctx.createWaveShaper();
    shaper.curve = distortionCurve(p.distortion);
    shaper.oversample = '2x';

    const makeup = ctx.createGain();
    makeup.gain.value = 1.4;

    input.connect(ring);
    ring.connect(shaper);
    shaper.connect(makeup);
    makeup.connect(output);
    carrier.start();

    return makeChain(input, output, [ring, shaper, makeup], [carrier]);
};

const buildCathedral = (ctx: AudioContext, p: Record<string, number>): VoiceEffectChain => {
    const input = ctx.createGain();
    const output = ctx.createGain();

    // Generated impulse response: exponentially decaying stereo noise.
    const seconds = p.duration;
    const decay = p.decay;
    const irLen = Math.round(seconds * ctx.sampleRate);
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
        const data = ir.getChannelData(ch);
        for (let i = 0; i < irLen; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, decay);
        }
    }

    const convolver = ctx.createConvolver();
    convolver.buffer = ir;

    const dry = ctx.createGain();
    dry.gain.value = p.dry;
    const wet = ctx.createGain();
    wet.gain.value = p.wet;

    input.connect(dry);
    dry.connect(output);
    input.connect(convolver);
    convolver.connect(wet);
    wet.connect(output);

    return makeChain(input, output, [convolver, dry, wet], []);
};

const buildChorus = (ctx: AudioContext, p: Record<string, number>): VoiceEffectChain => {
    const input = ctx.createGain();
    const output = ctx.createGain();

    const dry = ctx.createGain();
    dry.gain.value = 0.7;
    input.connect(dry);
    dry.connect(output);

    const nodes: AudioNode[] = [dry];
    const sources: StoppableSource[] = [];

    const voices = [
        { base: 0.022, rate: 0.8, depth: 0.004 },
        { base: 0.029, rate: 1.1, depth: 0.005 },
        { base: 0.035, rate: 0.6, depth: 0.006 },
    ];

    voices.forEach(({ base, rate, depth }) => {
        const delay = ctx.createDelay(0.1);
        delay.delayTime.value = base;
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = rate * p.rate;
        const lfoGain = ctx.createGain();
        // Cap the excursion below the base delay so delayTime stays positive.
        lfoGain.gain.value = Math.min(depth * p.depth, base - 0.002);
        lfo.connect(lfoGain);
        lfoGain.connect(delay.delayTime);

        const voiceGain = ctx.createGain();
        voiceGain.gain.value = p.mix;

        input.connect(delay);
        delay.connect(voiceGain);
        voiceGain.connect(output);
        lfo.start();

        nodes.push(delay, lfoGain, voiceGain);
        sources.push(lfo);
    });

    return makeChain(input, output, nodes, sources);
};

const buildMegaphone = (ctx: AudioContext, p: Record<string, number>): VoiceEffectChain => {
    const input = ctx.createGain();
    const output = ctx.createGain();

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = p.highpass;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = p.lowpass;

    const shaper = ctx.createWaveShaper();
    shaper.curve = distortionCurve(p.distortion);
    shaper.oversample = '2x';

    const makeup = ctx.createGain();
    makeup.gain.value = 1.3;

    input.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(shaper);
    shaper.connect(makeup);
    makeup.connect(output);

    return makeChain(input, output, [highpass, lowpass, shaper, makeup], []);
};

/**
 * Build the Web Audio graph for a preset. Optional overrides (from the effect
 * editor) are merged with the preset defaults and clamped. Returns null for
 * unknown ids.
 */
export const createVoiceEffectChain = (
    ctx: AudioContext,
    presetId: string,
    overrides?: Record<string, number>
): VoiceEffectChain | null => {
    const p = resolveEffectParams(presetId, overrides);
    switch (presetId) {
        case 'robot': return buildRobot(ctx, p);
        case 'deep': return buildPitchShift(ctx, p.semitones);
        case 'high': return buildPitchShift(ctx, p.semitones);
        case 'cathedral': return buildCathedral(ctx, p);
        case 'chorus': return buildChorus(ctx, p);
        case 'megaphone': return buildMegaphone(ctx, p);
        default: return null;
    }
};
