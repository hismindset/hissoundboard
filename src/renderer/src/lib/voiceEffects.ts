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

export interface VoiceEffectPreset {
    id: string;
    name: string;
    emoji: string;
    description: string;
}

export const VOICE_EFFECT_PRESETS: VoiceEffectPreset[] = [
    { id: 'robot', name: 'Roboter', emoji: '🤖', description: 'Ringmodulator – klassische Roboterstimme' },
    { id: 'deep', name: 'Tief', emoji: '🐻', description: 'Stimme nach unten gepitcht' },
    { id: 'high', name: 'Hoch', emoji: '🐿️', description: 'Stimme nach oben gepitcht' },
    { id: 'cathedral', name: 'Kirche', emoji: '⛪', description: 'Großer Hall wie in einer Kathedrale' },
    { id: 'chorus', name: 'Chor', emoji: '🎶', description: 'Mehrstimmiger Chorus-Effekt' },
    { id: 'megaphone', name: 'Megafon', emoji: '📣', description: 'Verzerrtes, blechernes Megafon' },
];

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

const buildRobot = (ctx: AudioContext): VoiceEffectChain => {
    const input = ctx.createGain();
    const output = ctx.createGain();

    // Ring modulator: multiply the voice with a low-frequency sine carrier.
    const ring = ctx.createGain();
    ring.gain.value = 0;
    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = 50;
    carrier.connect(ring.gain);

    const shaper = ctx.createWaveShaper();
    shaper.curve = distortionCurve(2);
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

const buildCathedral = (ctx: AudioContext): VoiceEffectChain => {
    const input = ctx.createGain();
    const output = ctx.createGain();

    // Generated impulse response: exponentially decaying stereo noise.
    const seconds = 2.8;
    const decay = 3.5;
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
    dry.gain.value = 0.6;
    const wet = ctx.createGain();
    wet.gain.value = 0.85;

    input.connect(dry);
    dry.connect(output);
    input.connect(convolver);
    convolver.connect(wet);
    wet.connect(output);

    return makeChain(input, output, [convolver, dry, wet], []);
};

const buildChorus = (ctx: AudioContext): VoiceEffectChain => {
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
        lfo.frequency.value = rate;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = depth;
        lfo.connect(lfoGain);
        lfoGain.connect(delay.delayTime);

        const voiceGain = ctx.createGain();
        voiceGain.gain.value = 0.45;

        input.connect(delay);
        delay.connect(voiceGain);
        voiceGain.connect(output);
        lfo.start();

        nodes.push(delay, lfoGain, voiceGain);
        sources.push(lfo);
    });

    return makeChain(input, output, nodes, sources);
};

const buildMegaphone = (ctx: AudioContext): VoiceEffectChain => {
    const input = ctx.createGain();
    const output = ctx.createGain();

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 500;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 3200;

    const shaper = ctx.createWaveShaper();
    shaper.curve = distortionCurve(8);
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

/** Build the Web Audio graph for a preset. Returns null for unknown ids. */
export const createVoiceEffectChain = (
    ctx: AudioContext,
    presetId: string
): VoiceEffectChain | null => {
    switch (presetId) {
        case 'robot': return buildRobot(ctx);
        case 'deep': return buildPitchShift(ctx, -5);
        case 'high': return buildPitchShift(ctx, 5);
        case 'cathedral': return buildCathedral(ctx);
        case 'chorus': return buildChorus(ctx);
        case 'megaphone': return buildMegaphone(ctx);
        default: return null;
    }
};
