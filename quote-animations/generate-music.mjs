#!/usr/bin/env node

/**
 * 8-bit chiptune generator for QvsView.qs promo animations.
 *
 * Synthesizes a peppy, loop-friendly chiptune track as a WAV file
 * using classic NES-style waveforms: square, triangle, and noise.
 *
 * Usage:
 *   node generate-music.mjs                     # 30s at 140 BPM
 *   node generate-music.mjs --duration 20       # 20 seconds
 *   node generate-music.mjs --bpm 160           # Faster tempo
 *   node generate-music.mjs --output my-tune.wav
 */

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, fallback) {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : fallback;
}

const SAMPLE_RATE = 44100;
const DURATION = Number(getArg('duration', 30));
const BPM = Number(getArg('bpm', 140));
const OUTPUT = getArg('output', join(__dirname, 'output', 'chiptune.wav'));

const BEAT = 60 / BPM; // seconds per beat
const TOTAL_SAMPLES = Math.ceil(SAMPLE_RATE * DURATION);

// ─────────────────────────────────────────────────────────
// Waveform generators (all return -1 to 1)
// ─────────────────────────────────────────────────────────

/** Square wave with configurable duty cycle. */
function square(phase, duty = 0.5) {
    return phase % 1 < duty ? 1 : -1;
}

/** Triangle wave — smooth, bass-friendly. */
function triangle(phase) {
    const p = phase % 1;
    return p < 0.5 ? 4 * p - 1 : 3 - 4 * p;
}

/** Noise — pseudo-random for percussion. Uses a simple LFSR-style approach. */
let noiseSeed = 1;
function noise() {
    // Linear feedback shift register (16-bit, taps at 0 and 2)
    noiseSeed ^= noiseSeed << 13;
    noiseSeed ^= noiseSeed >> 17;
    noiseSeed ^= noiseSeed << 5;
    return (noiseSeed & 0xffff) / 0x7fff - 1;
}

// ─────────────────────────────────────────────────────────
// Musical definitions
// ─────────────────────────────────────────────────────────

/** Convert MIDI note number to frequency. */
function midiToFreq(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
}

// Note name helpers (octave 4 = middle C area)
const NOTE = {
    C3: 48,
    D3: 50,
    E3: 52,
    F3: 53,
    G3: 55,
    A3: 57,
    B3: 59,
    C4: 60,
    D4: 62,
    E4: 64,
    F4: 65,
    G4: 67,
    A4: 69,
    B4: 71,
    C5: 72,
    D5: 74,
    E5: 76,
    F5: 77,
    G5: 79,
    A5: 81,
    B5: 83,
    C6: 84,
    REST: -1,
};

// ── Melody (peppy, positive, techy vibe) ──
// Each entry: [noteNumber, durationInBeats]
// The melody loops. Key of C major / A minor.
const MELODY = [
    // Phrase 1: Rising energy
    [NOTE.E4, 0.5],
    [NOTE.G4, 0.5],
    [NOTE.A4, 0.5],
    [NOTE.C5, 0.5],
    [NOTE.B4, 0.5],
    [NOTE.G4, 0.5],
    [NOTE.A4, 1],
    // Phrase 2: Bouncy response
    [NOTE.G4, 0.5],
    [NOTE.E4, 0.5],
    [NOTE.F4, 0.5],
    [NOTE.G4, 0.5],
    [NOTE.A4, 0.75],
    [NOTE.G4, 0.25],
    [NOTE.E4, 1],
    // Phrase 3: Climbing arpeggio
    [NOTE.C4, 0.25],
    [NOTE.E4, 0.25],
    [NOTE.G4, 0.25],
    [NOTE.C5, 0.25],
    [NOTE.E5, 0.5],
    [NOTE.D5, 0.5],
    [NOTE.C5, 0.5],
    [NOTE.B4, 0.5],
    // Phrase 4: Resolution
    [NOTE.A4, 0.5],
    [NOTE.C5, 0.5],
    [NOTE.B4, 0.5],
    [NOTE.G4, 0.5],
    [NOTE.A4, 0.75],
    [NOTE.REST, 0.25],
    [NOTE.A4, 0.25],
    [NOTE.B4, 0.25],
    [NOTE.C5, 0.5],

    // Phrase 5: Variation — descending motif
    [NOTE.C5, 0.5],
    [NOTE.B4, 0.5],
    [NOTE.A4, 0.5],
    [NOTE.G4, 0.5],
    [NOTE.F4, 0.5],
    [NOTE.A4, 0.5],
    [NOTE.G4, 1],
    // Phrase 6: Playful bounce
    [NOTE.E4, 0.25],
    [NOTE.E4, 0.25],
    [NOTE.REST, 0.25],
    [NOTE.G4, 0.25],
    [NOTE.G4, 0.25],
    [NOTE.REST, 0.25],
    [NOTE.A4, 0.25],
    [NOTE.C5, 0.25],
    [NOTE.B4, 0.5],
    [NOTE.A4, 0.5],
    [NOTE.G4, 1],
    // Phrase 7: Big arpeggio up
    [NOTE.C4, 0.25],
    [NOTE.E4, 0.25],
    [NOTE.G4, 0.25],
    [NOTE.B4, 0.25],
    [NOTE.C5, 0.25],
    [NOTE.E5, 0.25],
    [NOTE.G5, 0.5],
    [NOTE.E5, 0.5],
    [NOTE.C5, 0.5],
    [NOTE.G4, 0.5],
    // Phrase 8: End with a flourish
    [NOTE.A4, 0.5],
    [NOTE.B4, 0.5],
    [NOTE.C5, 1],
    [NOTE.REST, 0.5],
    [NOTE.G4, 0.25],
    [NOTE.A4, 0.25],
    [NOTE.B4, 0.5],
    [NOTE.C5, 0.5],
];

// ── Bass line (triangle wave) ──
const BASS = [
    // 4 bars of 4 beats each (repeating pattern)
    [NOTE.C3, 1],
    [NOTE.C3, 0.5],
    [NOTE.G3, 0.5],
    [NOTE.C3, 1],
    [NOTE.E3, 1],
    [NOTE.A3, 1],
    [NOTE.A3, 0.5],
    [NOTE.E3, 0.5],
    [NOTE.A3, 1],
    [NOTE.G3, 1],
    [NOTE.F3, 1],
    [NOTE.F3, 0.5],
    [NOTE.C3, 0.5],
    [NOTE.F3, 1],
    [NOTE.G3, 1],
    [NOTE.G3, 1],
    [NOTE.G3, 0.5],
    [NOTE.D3, 0.5],
    [NOTE.G3, 1],
    [NOTE.G3, 0.5],
    [NOTE.REST, 0.5],

    [NOTE.C3, 1],
    [NOTE.E3, 0.5],
    [NOTE.G3, 0.5],
    [NOTE.C3, 1.5],
    [NOTE.REST, 0.5],
    [NOTE.A3, 1],
    [NOTE.C3, 0.5],
    [NOTE.E3, 0.5],
    [NOTE.A3, 1],
    [NOTE.G3, 1],
    [NOTE.F3, 1],
    [NOTE.A3, 0.5],
    [NOTE.C3, 0.5],
    [NOTE.F3, 1.5],
    [NOTE.REST, 0.5],
    [NOTE.G3, 1],
    [NOTE.B3, 0.5],
    [NOTE.D3, 0.5],
    [NOTE.G3, 1],
    [NOTE.G3, 0.5],
    [NOTE.REST, 0.5],
];

// ── Drum pattern (noise channel) — 4 beats, loops ──
// [type, beatPosition] — kick on 1,3; snare on 2,4; hat on 8ths
const DRUM_PATTERN_BEATS = 4;
const DRUMS = [
    { type: 'kick', beat: 0 },
    { type: 'hat', beat: 0.5 },
    { type: 'snare', beat: 1 },
    { type: 'hat', beat: 1.5 },
    { type: 'kick', beat: 2 },
    { type: 'hat', beat: 2.5 },
    { type: 'snare', beat: 3 },
    { type: 'hat', beat: 3.25 },
    { type: 'hat', beat: 3.5 },
    { type: 'hat', beat: 3.75 },
];

// ─────────────────────────────────────────────────────────
// Envelope helpers
// ─────────────────────────────────────────────────────────

/** Simple ADSR-ish envelope for notes. */
function noteEnvelope(t, duration) {
    const attack = 0.01;
    const release = Math.min(0.05, duration * 0.3);
    if (t < attack) return t / attack;
    if (t > duration - release) return Math.max(0, (duration - t) / release);
    return 1;
}

/** Drum hit envelope — sharp attack, fast decay. */
function drumEnvelope(t, decay) {
    if (t < 0) return 0;
    return Math.max(0, Math.exp(-t / decay));
}

// ─────────────────────────────────────────────────────────
// Sequence expander — converts [note, beats][] to timed events
// ─────────────────────────────────────────────────────────

function expandSequence(pattern) {
    const events = [];
    let time = 0;
    let totalBeats = 0;
    for (const [note, beats] of pattern) {
        totalBeats += beats;
        events.push({ note, startTime: time, duration: beats * BEAT });
        time += beats * BEAT;
    }
    return { events, totalTime: time, totalBeats };
}

// ─────────────────────────────────────────────────────────
// Render audio
// ─────────────────────────────────────────────────────────

function render() {
    console.log(`🎵 Generating 8-bit chiptune: ${DURATION}s @ ${BPM} BPM`);

    const melody = expandSequence(MELODY);
    const bass = expandSequence(BASS);
    const drumLoopTime = DRUM_PATTERN_BEATS * BEAT;

    const buffer = new Float32Array(TOTAL_SAMPLES);

    for (let i = 0; i < TOTAL_SAMPLES; i++) {
        const t = i / SAMPLE_RATE;
        let sample = 0;

        // ── Melody (square wave, 25% duty) ──
        const melodyT = t % melody.totalTime;
        for (const ev of melody.events) {
            if (ev.note === NOTE.REST) continue;
            const localT = melodyT - ev.startTime;
            if (localT >= 0 && localT < ev.duration) {
                const freq = midiToFreq(ev.note);
                const phase = freq * t; // Use absolute time for smooth phase
                const env = noteEnvelope(localT, ev.duration);
                sample += square(phase, 0.25) * env * 0.22;
                break;
            }
        }

        // ── Arpeggio layer (square wave, 12.5% duty, higher octave) ──
        // Quick arpeggio overlay on strong beats every 2 bars
        const arpeggioLoopTime = 8 * BEAT;
        const arpeggioT = t % arpeggioLoopTime;
        if (arpeggioT < BEAT * 0.5) {
            // Quick C-E-G arp
            const arpNotes = [NOTE.C5, NOTE.E5, NOTE.G5];
            const arpIdx = Math.floor((arpeggioT / (BEAT * 0.5)) * 3) % 3;
            const freq = midiToFreq(arpNotes[arpIdx]);
            const env = noteEnvelope(arpeggioT, BEAT * 0.5) * 0.5;
            sample += square(freq * t, 0.125) * env * 0.1;
        }

        // ── Bass (triangle wave) ──
        const bassT = t % bass.totalTime;
        for (const ev of bass.events) {
            if (ev.note === NOTE.REST) continue;
            const localT = bassT - ev.startTime;
            if (localT >= 0 && localT < ev.duration) {
                const freq = midiToFreq(ev.note);
                const phase = freq * t;
                const env = noteEnvelope(localT, ev.duration);
                sample += triangle(phase) * env * 0.25;
                break;
            }
        }

        // ── Drums (noise) ──
        const drumT = t % drumLoopTime;
        for (const drum of DRUMS) {
            const hitT = drumT - drum.beat * BEAT;
            if (hitT >= 0 && hitT < 0.15) {
                if (drum.type === 'kick') {
                    // Kick: low-freq sine with fast pitch decay
                    const kickFreq = 60 + 200 * Math.exp(-hitT * 40);
                    sample +=
                        Math.sin(2 * Math.PI * kickFreq * hitT) * drumEnvelope(hitT, 0.08) * 0.3;
                } else if (drum.type === 'snare') {
                    // Snare: noise burst + tone
                    sample += noise() * drumEnvelope(hitT, 0.05) * 0.15;
                    sample += Math.sin(2 * Math.PI * 200 * hitT) * drumEnvelope(hitT, 0.03) * 0.1;
                } else if (drum.type === 'hat') {
                    // Hi-hat: high-frequency noise, very short
                    sample += noise() * drumEnvelope(hitT, 0.02) * 0.08;
                }
            }
        }

        // ── Master: soft clip + fade in/out ──
        // Fade in first 0.5s, fade out last 2s
        let gain = 1;
        if (t < 0.5) gain = t / 0.5;
        if (t > DURATION - 2) gain = Math.max(0, (DURATION - t) / 2);

        sample *= gain;

        // Soft clip to avoid harsh distortion
        sample = Math.tanh(sample * 1.2);

        buffer[i] = sample;
    }

    return buffer;
}

// ─────────────────────────────────────────────────────────
// WAV writer
// ─────────────────────────────────────────────────────────

function writeWav(filePath, samples) {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = SAMPLE_RATE * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = samples.length * (bitsPerSample / 8);
    const fileSize = 36 + dataSize;

    const buf = Buffer.alloc(44 + dataSize);
    let offset = 0;

    // RIFF header
    buf.write('RIFF', offset);
    offset += 4;
    buf.writeUInt32LE(fileSize, offset);
    offset += 4;
    buf.write('WAVE', offset);
    offset += 4;

    // fmt chunk
    buf.write('fmt ', offset);
    offset += 4;
    buf.writeUInt32LE(16, offset);
    offset += 4; // chunk size
    buf.writeUInt16LE(1, offset);
    offset += 2; // PCM format
    buf.writeUInt16LE(numChannels, offset);
    offset += 2;
    buf.writeUInt32LE(SAMPLE_RATE, offset);
    offset += 4;
    buf.writeUInt32LE(byteRate, offset);
    offset += 4;
    buf.writeUInt16LE(blockAlign, offset);
    offset += 2;
    buf.writeUInt16LE(bitsPerSample, offset);
    offset += 2;

    // data chunk
    buf.write('data', offset);
    offset += 4;
    buf.writeUInt32LE(dataSize, offset);
    offset += 4;

    // Write samples
    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        buf.writeInt16LE(Math.round(s * 32767), offset);
        offset += 2;
    }

    writeFileSync(filePath, buf);
    const sizeKB = Math.round(buf.length / 1024);
    console.log(`   ✅ ${filePath} (${sizeKB} KB, ${DURATION}s)`);
}

// ─────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────

import { mkdirSync } from 'node:fs';
mkdirSync(dirname(OUTPUT), { recursive: true });

const samples = render();
writeWav(OUTPUT, samples);

console.log('   Play it: afplay ' + OUTPUT);
