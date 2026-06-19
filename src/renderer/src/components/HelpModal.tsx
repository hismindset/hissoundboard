import React from 'react';

interface HelpModalProps {
    onClose: () => void;
}

const ExtLink: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => (
    <button
        type="button"
        onClick={() => window.api.openExternal?.(href)}
        className="text-accent-light underline decoration-dotted underline-offset-2 hover:text-accent transition-colors"
    >
        {children}
    </button>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="space-y-2">
        <h3 className="text-sm font-bold text-white/90">{title}</h3>
        <div className="text-[13px] leading-relaxed text-surface-300 space-y-2">{children}</div>
    </section>
);

const Faq: React.FC<{ q: string; children: React.ReactNode }> = ({ q, children }) => (
    <div className="rounded-lg bg-surface-800/50 border border-surface-700/40 px-3 py-2">
        <p className="text-[13px] font-medium text-white/85">{q}</p>
        <div className="text-[12px] leading-relaxed text-surface-400 mt-1 space-y-1">{children}</div>
    </div>
);

/**
 * In-app help popup. Content mirrors the README (prerequisites, mic setup,
 * shortcuts, remote, privacy) so users don't have to leave the app.
 */
const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col bg-surface-900 border border-surface-600/40 rounded-2xl shadow-2xl animate-scale-in overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-surface-700/40 shrink-0">
                    <h2 className="text-lg font-bold text-white/90 flex items-center gap-2">
                        <svg className="w-5 h-5 text-accent-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
                        </svg>
                        Help &amp; Info
                    </h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-surface-400 hover:text-white hover:bg-surface-700 transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Body (scrollable) */}
                <div className="px-5 py-4 space-y-6 overflow-y-auto">
                    <p className="text-[13px] text-surface-300">
                        HISSOUNDBOARD plays your sounds into voice chats with dual output (your
                        headphones <em>and</em> a virtual microphone), global hotkeys, multiple
                        pages, and a phone remote. Here's how to get set up.
                    </p>

                    <Section title="🎧 Software requirements — Virtual Audio Device">
                        <p>
                            To play sounds into Discord, Teams, Zoom, etc., you need a{' '}
                            <strong>virtual audio device</strong>. HISSOUNDBOARD plays into it, and
                            your voice-chat app then listens to it as a microphone.
                        </p>
                        <ul className="list-disc pl-5 space-y-1">
                            <li>
                                <strong>Windows:</strong> VB-Cable (free) —{' '}
                                <ExtLink href="https://vb-audio.com/Cable/">vb-audio.com/Cable</ExtLink>
                            </li>
                            <li>
                                <strong>macOS:</strong> BlackHole (free) —{' '}
                                <ExtLink href="https://github.com/ExistentialAudio/BlackHole">github.com/ExistentialAudio/BlackHole</ExtLink>
                            </li>
                            <li>
                                <strong>Linux:</strong> PulseAudio/PipeWire null sink — built-in, the
                                app can auto-create it for you.
                            </li>
                        </ul>
                        <p className="text-[12px] text-surface-400">
                            After installing: open <strong>Settings</strong> (or the Audio Setup
                            Wizard), set the <strong>Output Device</strong> to your virtual cable, then
                            in your voice-chat app set the <strong>Input/Microphone</strong> to that
                            same cable.
                        </p>
                    </Section>

                    <Section title="🎙️ Microphone injection (passthrough)">
                        <p>
                            So your friends hear <em>you + the sounds</em> through one virtual mic,
                            enable mic injection:
                        </p>
                        <ol className="list-decimal pl-5 space-y-1">
                            <li>Open <strong>Settings</strong> → “Microphone Injection”.</li>
                            <li>Select your hardware microphone (e.g. headset, USB mic).</li>
                            <li>The app routes your voice to the Output device (the cable).</li>
                        </ol>
                        <p className="text-[12px] text-surface-400">
                            You won't hear yourself (that prevents feedback), but the voice chat will
                            hear your voice together with the soundboard. On Linux, the OS mixes the
                            mic at system level, so the in-app passthrough is intentionally disabled
                            there to avoid doubling your voice.
                        </p>
                    </Section>

                    <Section title="⌨️ Shortcuts &amp; controls">
                        <ul className="list-disc pl-5 space-y-1">
                            <li><strong>Click</strong> a cell: play the sound.</li>
                            <li><strong>Right-click</strong> a cell: edit the sound (volume, trim, fade in/out, one-shot/loop).</li>
                            <li><strong>Middle-click</strong> a cell: remove the sound from that slot.</li>
                            <li><strong>Escape</strong>: panic — stop all sounds at once.</li>
                            <li><strong>Global hotkeys</strong> work even when the app is minimized (Numpad or 1–9 modes, with per-page Ctrl/Alt/Shift modifiers). Assign per-page trigger keys via the key icon in the sidebar.</li>
                        </ul>
                    </Section>

                    <Section title="🎚️ Editing a sound">
                        <p>
                            Right-click a sound to open the editor: adjust volume (up to 200%), trim
                            the start/end on the waveform, set an optional <strong>fade-in/-out</strong>{' '}
                            by dragging the small handles at the top corners of the waveform, and
                            choose <strong>one-shot</strong> or <strong>loop</strong> playback. Use
                            Preview to hear the result before saving.
                        </p>
                    </Section>

                    <Section title="📱 Phone / tablet remote">
                        <ol className="list-decimal pl-5 space-y-1">
                            <li>Make sure your phone is on the <strong>same network</strong> as this PC.</li>
                            <li>Open <strong>Settings</strong> and scan the <strong>QR code</strong> (or type the shown <code>http://…:8080</code> address).</li>
                            <li>Tap sounds, switch pages, or hit Stop All — it updates live as you edit the board.</li>
                        </ol>
                    </Section>

                    <Section title="❓ FAQ">
                        <Faq q="I don't hear anything in my voice chat.">
                            <p>Check that your voice-chat app's microphone is set to the virtual cable (VB-Cable / BlackHole), and that the app's Output Device points to the same cable in Settings.</p>
                        </Faq>
                        <Faq q="Sounds are too loud or too quiet for others.">
                            <p>Adjust the per-side Output volume in Settings, and the per-sound volume in the sound editor (right-click a sound).</p>
                        </Faq>
                        <Faq q="A sound starts/ends too abruptly.">
                            <p>Open the editor and drag the fade handles at the top corners of the waveform to add a fade-in and/or fade-out.</p>
                        </Faq>
                        <Faq q="Global hotkeys don't work on my Linux desktop.">
                            <p>On Wayland the app automatically falls back to Electron's built-in shortcuts (you'll see a notice). Some compositors restrict global keys — running on X11 is the most reliable.</p>
                        </Faq>
                        <Faq q="Where are my sound files stored?">
                            <p>In the app's data folder by default, or a custom directory you pick in Settings. Files stay local and are never uploaded.</p>
                        </Faq>
                    </Section>

                    <Section title="🔒 Privacy">
                        <p>
                            No telemetry. The phone remote runs a small local web server on port
                            8080, bound to your LAN only — nothing leaves your network. Your sounds
                            stay on your machine.
                        </p>
                    </Section>

                    <p className="text-[12px] text-surface-500 pt-1">
                        Made by HISMINDSET ·{' '}
                        <ExtLink href="https://github.com/hismindset/hissoundboard">Project on GitHub</ExtLink>
                    </p>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-surface-700/40 shrink-0">
                    <button
                        onClick={onClose}
                        className="px-5 py-2 rounded-xl text-sm font-medium bg-accent text-white hover:bg-accent-dark transition-colors"
                    >
                        Got it
                    </button>
                </div>
            </div>
        </div>
    );
};

export default HelpModal;
