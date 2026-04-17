#!/usr/bin/env node

/**
 * QvsView.qs — Animated quote GIF/MP4 generator.
 *
 * Renders each LOADING_MESSAGES category as an animated social-media teaser
 * using Playwright (headless Chromium) for frame capture and ffmpeg for encoding.
 *
 * Usage:
 *   node generate.mjs                  # GIF only (default)
 *   node generate.mjs --format mp4     # MP4 with 8-bit chiptune
 *   node generate.mjs --format all     # Both GIF and MP4
 *   node generate.mjs --category yoda  # Single category (slug match)
 *   node generate.mjs --size 1080x1080 # Single size
 *   node generate.mjs --music bg.mp3   # Use custom background music instead of chiptune
 *   node generate.mjs --no-music       # MP4 without any audio
 */

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import {
    existsSync,
    mkdirSync,
    readdirSync,
    rmSync,
    readFileSync,
    writeFileSync,
    statSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────
// Data — copied from src/ui/ai-modal.js to avoid ESM/UMD issues
// ─────────────────────────────────────────────────────────
const CATEGORIES = [
    {
        slug: 'rocket-launch',
        title: 'Rocket Launch Sequence',
        titleIcon: '🚀',
        quotes: [
            { icon: '🚀', text: 'T-minus 10… igniting AI thrusters…' },
            { icon: '🔥', text: 'Main engines firing. Hold on tight.' },
            { icon: '🛸', text: 'Entering orbit around your data model…' },
            { icon: '📡', text: 'Establishing link with the analysis mothership…' },
            { icon: '🌕', text: 'Achieving stable orbit. Scanning payload…' },
        ],
    },
    {
        slug: 'yoda',
        title: 'Yoda',
        titleIcon: '�',
        quotes: [
            { icon: '💚', text: 'Patience you must have, young analyst.' },
            { icon: '💚', text: 'Strong with the script, this one is.' },
            { icon: '💚', text: 'Analyze or analyze not. There is no try.' },
            { icon: '💚', text: 'Much to learn, your data model still has.' },
            { icon: '💚', text: 'Clouded by JOINs, the future is.' },
        ],
    },
    {
        slug: 'pirate',
        title: 'Pirate',
        titleIcon: '🏴\u200D☠️',
        quotes: [
            { icon: '🏴\u200D☠️', text: "Arrr! Navigatin' through yer data seas…" },
            { icon: '🏴\u200D☠️', text: "Swabbin' the data deck, cap'n!" },
            { icon: '🦜', text: 'Polly wants a scatter plot!' },
            { icon: '🏴\u200D☠️', text: 'X marks the spot where the QVD be buried!' },
            { icon: '🏴\u200D☠️', text: 'Hoisting the Jolly LOAD-er!' },
        ],
    },
    {
        slug: 'mission-control',
        title: 'Mission Control',
        titleIcon: '👨\u200D🚀',
        quotes: [
            { icon: '👨\u200D🚀', text: 'Houston, we have… a lot of LOAD statements.' },
            { icon: '🛰️', text: 'Deploying satellite analysis array…' },
            { icon: '🌍', text: 'Re-entering the atmosphere of your QVDs…' },
            { icon: '📟', text: 'Telemetry nominal. Data looks good, Flight.' },
            { icon: '🧑\u200D🚀', text: 'Copy that, we have visual on the data model.' },
        ],
    },
    {
        slug: 'chef',
        title: 'Chef',
        titleIcon: '👨\u200D🍳',
        quotes: [
            { icon: '👨\u200D🍳', text: 'Marinating the data transformations…' },
            { icon: '🍝', text: 'Your script is al dente. Almost there.' },
            { icon: '🔪', text: 'Dicing up those resident loads…' },
            { icon: '🧂', text: 'Adding a pinch of optimization…' },
            { icon: '🍰', text: 'Baking a layered data model from scratch…' },
        ],
    },
    {
        slug: 'dramatic',
        title: 'Dramatic',
        titleIcon: '🎬',
        quotes: [
            { icon: '🎬', text: 'In a codebase far, far away…' },
            { icon: '⚔️', text: 'The script strikes back!' },
            { icon: '🤖', text: 'Beep boop. Processing human data rituals.' },
            { icon: '🧙', text: 'A wizard is never late. Nor is this analysis.' },
            { icon: '🦸', text: 'With great data comes great responsibility.' },
        ],
    },
    {
        slug: 'detective',
        title: 'Detective',
        titleIcon: '🕵️',
        quotes: [
            { icon: '🕵️', text: 'Interrogating suspicious WHERE clauses…' },
            { icon: '🔍', text: 'Following the trail of orphaned keys…' },
            { icon: '🕵️', text: 'The case of the missing LEFT JOIN…' },
            { icon: '🔎', text: 'Dusting for fingerprints on the data model…' },
            { icon: '🕵️', text: 'Elementary, my dear data engineer.' },
        ],
    },
    {
        slug: 'misc-fun',
        title: 'Misc Fun',
        titleIcon: '🎲',
        quotes: [
            { icon: '🎲', text: 'Rolling for critical analysis…' },
            { icon: '🧪', text: 'Brewing a fresh batch of insights…' },
            { icon: '🐉', text: 'Taming the data dragon…' },
            { icon: '🎸', text: 'Shredding through your script like a solo…' },
            { icon: '🏋️', text: 'Heavy-lifting those nested loads…' },
        ],
    },
];

// ─────────────────────────────────────────────────────────
// Sizes — { label, width, height }
// ─────────────────────────────────────────────────────────
const SIZES = [
    { label: '1080x1080', width: 1080, height: 1080 },
    { label: '800x450', width: 800, height: 450 },
    { label: '1200x628', width: 1200, height: 628 },
];

// ─────────────────────────────────────────────────────────
// Timing (in seconds)
// ─────────────────────────────────────────────────────────
const FPS = 15;
const FADE_DURATION = 0.3; // seconds per fade-in / fade-out
const INTRO_HOLD = 3.0;
const QUOTE_HOLD = 2.0;
const LOGO_FADE_IN = 0.5;
const LOGO_HOLD = 4.0;

// ─────────────────────────────────────────────────────────
// Parse CLI args
// ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name) {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

const formatArg = (getArg('format') || 'gif').toLowerCase();
if (!['gif', 'mp4', 'all'].includes(formatArg)) {
    console.error(`Invalid --format: ${formatArg}. Use gif, mp4, or all.`);
    process.exit(1);
}
const formats = formatArg === 'all' ? ['gif', 'mp4'] : [formatArg];

const categoryFilter = getArg('category');
const sizeFilter = getArg('size');
const musicPath = getArg('music');
const noMusic = args.includes('--no-music');

const selectedCategories = categoryFilter
    ? CATEGORIES.filter((c) => c.slug.includes(categoryFilter.toLowerCase()))
    : CATEGORIES;

const selectedSizes = sizeFilter ? SIZES.filter((s) => s.label === sizeFilter) : SIZES;

if (selectedCategories.length === 0) {
    console.error(
        `No category matching "${categoryFilter}". Available: ${CATEGORIES.map((c) => c.slug).join(', ')}`
    );
    process.exit(1);
}
if (selectedSizes.length === 0) {
    console.error(
        `No size matching "${sizeFilter}". Available: ${SIZES.map((s) => s.label).join(', ')}`
    );
    process.exit(1);
}

// ─────────────────────────────────────────────────────────
// Paths
// ─────────────────────────────────────────────────────────
const OUTPUT_DIR = join(__dirname, 'output');
const FRAMES_DIR = join(__dirname, 'tmp-frames');
const TEMPLATE_PATH = join(__dirname, 'template.html');
const SVG_PATH = resolve(__dirname, '..', 'preview.svg');
const PTARMIGAN_SVG_PATH = join(__dirname, 'square 1.svg');

// Read SVG as data URI for embedding
const svgContent = readFileSync(SVG_PATH, 'utf-8');
const svgDataUri = `data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}`;

// Read Ptarmigan Labs logo as data URI
const ptarmiganContent = readFileSync(PTARMIGAN_SVG_PATH, 'utf-8');
const ptarmiganDataUri = `data:image/svg+xml;base64,${Buffer.from(ptarmiganContent).toString('base64')}`;

// ─────────────────────────────────────────────────────────
// HTML content generators
// ─────────────────────────────────────────────────────────

/** Intro slide — branded opener with small logo */
function introHtml() {
    return `
        <div class="intro-container">
            <img class="intro-logo" src="${svgDataUri}" alt="QvsView.qs">
            <div class="intro-text">Meanwhile, while analyzing<br>your Qlik script…</div>
        </div>
    `;
}

/** Quote slide HTML */
function quoteHtml(quote) {
    return `
        <div class="category-badge">QvsView.qs</div>
        <div class="icon">${quote.icon}</div>
        <div class="quote">${escapeHtml(quote.text)}</div>
    `;
}

/** Logo / tagline slide HTML — expanded description */
function logoHtml() {
    return `
        <div class="logo-container">
            <img src="${svgDataUri}" alt="QvsView.qs">
            <div class="logo-name">QvsView.qs</div>
            <div class="tagline">An open-source Qlik Sense extension that lets you view,<br>navigate, and AI-analyze your load scripts</div>
            <div class="tagline-coming">Coming soon to a Qlik Sense<br>environment near you</div>
            <div class="attribution">
                <img src="${ptarmiganDataUri}" alt="Ptarmigan Labs">
                <span>by Ptarmigan Labs</span>
            </div>
        </div>
    `;
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────────────────
// Frame generation helpers
// ─────────────────────────────────────────────────────────

/**
 * Generate opacity values for a fade-in → hold → fade-out sequence.
 *
 * @param {number} fadeIn   - Fade-in duration in seconds.
 * @param {number} hold     - Hold duration in seconds.
 * @param {number} fadeOut  - Fade-out duration in seconds.
 *
 * @returns {number[]} Array of opacity values (0–1), one per frame.
 */
function fadeSequence(fadeIn, hold, fadeOut) {
    const frames = [];
    const fadeInFrames = Math.round(fadeIn * FPS);
    const holdFrames = Math.round(hold * FPS);
    const fadeOutFrames = Math.round(fadeOut * FPS);

    for (let i = 0; i < fadeInFrames; i++) {
        frames.push(i / Math.max(fadeInFrames - 1, 1));
    }
    for (let i = 0; i < holdFrames; i++) {
        frames.push(1);
    }
    for (let i = 0; i < fadeOutFrames; i++) {
        frames.push(1 - i / Math.max(fadeOutFrames - 1, 1));
    }
    return frames;
}

// ─────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────
async function main() {
    mkdirSync(OUTPUT_DIR, { recursive: true });

    const totalJobs = selectedCategories.length * selectedSizes.length * formats.length;
    console.log(
        `\n🎬 Generating ${totalJobs} animation(s): ${selectedCategories.length} categories × ${selectedSizes.length} sizes × ${formats.length} format(s)\n`
    );

    const browser = await chromium.launch();

    try {
        for (const category of selectedCategories) {
            for (const size of selectedSizes) {
                await renderFrames(browser, category, size);

                for (const fmt of formats) {
                    await encode(category, size, fmt);
                }

                // Clean up temp frames
                cleanFrames();
            }
        }
    } finally {
        await browser.close();
    }

    console.log(`\n✅ Done! Output in: ${OUTPUT_DIR}\n`);
    listOutput();
}

/**
 * Render all PNG frames for a single category + size combo.
 *
 * @param {import('playwright').Browser} browser - Playwright browser instance.
 * @param {object} category - Category object.
 * @param {object} size - Size object { label, width, height }.
 */
async function renderFrames(browser, category, size) {
    // Prepare temp directory
    if (existsSync(FRAMES_DIR)) rmSync(FRAMES_DIR, { recursive: true });
    mkdirSync(FRAMES_DIR, { recursive: true });

    const context = await browser.newContext({
        viewport: { width: size.width, height: size.height },
        deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.goto(`file://${TEMPLATE_PATH}`, { waitUntil: 'networkidle' });

    // Set Ptarmigan Labs watermark
    await page.evaluate((src) => {
        document.getElementById('watermark').src = src;
    }, ptarmiganDataUri);

    let frameNum = 0;
    const pad = (n) => String(n).padStart(6, '0');

    console.log(`  📸 ${category.slug} @ ${size.label} — capturing frames...`);

    // --- Intro slide (branded opener) ---
    const introOpacities = fadeSequence(FADE_DURATION, INTRO_HOLD, FADE_DURATION);
    for (const opacity of introOpacities) {
        await setSlide(page, introHtml(), opacity);
        await page.screenshot({ path: join(FRAMES_DIR, `frame-${pad(frameNum++)}.png`) });
    }

    // --- Quote slides ---
    for (const quote of category.quotes) {
        const quoteOpacities = fadeSequence(FADE_DURATION, QUOTE_HOLD, FADE_DURATION);
        for (const opacity of quoteOpacities) {
            await setSlide(page, quoteHtml(quote), opacity);
            await page.screenshot({ path: join(FRAMES_DIR, `frame-${pad(frameNum++)}.png`) });
        }
    }

    // --- Logo slide (no fade-out — hold at end, hide watermark) ---
    const logoOpacities = fadeSequence(LOGO_FADE_IN, LOGO_HOLD, 0);
    for (const opacity of logoOpacities) {
        await setSlide(page, logoHtml(), opacity, { hideWatermark: true });
        await page.screenshot({ path: join(FRAMES_DIR, `frame-${pad(frameNum++)}.png`) });
    }

    await context.close();
    console.log(`         ${frameNum} frames captured`);
}

/**
 * Inject HTML content and set opacity on the slide element.
 *
 * @param {import('playwright').Page} page - Active Playwright page.
 * @param {string} html - Inner HTML for the slide.
 * @param {number} opacity - Opacity value (0–1).
 */
async function setSlide(page, html, opacity, { hideWatermark = false } = {}) {
    await page.evaluate(
        ({ html, opacity, hideWatermark }) => {
            const slide = document.getElementById('slide');
            slide.innerHTML = html;
            slide.style.setProperty('--opacity', opacity);
            slide.style.opacity = opacity;
            const wm = document.getElementById('watermark');
            if (wm) wm.style.display = hideWatermark ? 'none' : '';
        },
        { html, opacity, hideWatermark }
    );
    // Small delay to let emoji and fonts render
    await page.waitForTimeout(30);
}

/**
 * Compute the total video duration for a category (in seconds).
 *
 * @param {object} category - Category object.
 *
 * @returns {number} Duration in seconds.
 */
function computeDuration(category) {
    const introDur = FADE_DURATION + INTRO_HOLD + FADE_DURATION;
    const quotesDur = category.quotes.length * (FADE_DURATION + QUOTE_HOLD + FADE_DURATION);
    const logoDur = LOGO_FADE_IN + LOGO_HOLD;
    return introDur + quotesDur + logoDur;
}

/**
 * Get or generate the chiptune music file.
 * Uses --music <file> if provided, otherwise auto-generates via generate-music.mjs.
 *
 * @returns {string} Path to the music WAV file.
 */
function ensureMusic() {
    if (musicPath) {
        if (!existsSync(musicPath)) {
            console.error(`  ❌ Music file not found: ${musicPath}`);
            process.exit(1);
        }
        return musicPath;
    }

    const tunePath = join(OUTPUT_DIR, 'chiptune.wav');
    if (!existsSync(tunePath)) {
        console.log('  🎵 Generating 8-bit chiptune...');
        execFileSync(
            process.execPath,
            [join(__dirname, 'generate-music.mjs'), '--duration', '45', '--output', tunePath],
            { stdio: 'inherit' }
        );
    }
    return tunePath;
}

/**
 * Encode frames into GIF or MP4 using ffmpeg.
 *
 * @param {object} category - Category object.
 * @param {object} size - Size object.
 * @param {'gif'|'mp4'} format - Output format.
 */
function encode(category, size, format) {
    const slug = `${category.slug}-${size.label}`;
    const inputPattern = join(FRAMES_DIR, 'frame-%06d.png');

    if (format === 'gif') {
        encodeGif(slug, inputPattern);
    } else {
        encodeMp4(slug, inputPattern, category);
    }
}

/**
 * Two-pass palette-optimized GIF encoding.
 *
 * @param {string} slug - Output file name (without extension).
 * @param {string} inputPattern - ffmpeg input frame pattern.
 */
function encodeGif(slug, inputPattern) {
    const palettePath = join(FRAMES_DIR, 'palette.png');
    const outputPath = join(OUTPUT_DIR, `${slug}.gif`);

    console.log(`  🎨 Encoding GIF: ${slug}.gif`);

    // Pass 1: Generate palette
    execFileSync(
        'ffmpeg',
        [
            '-y',
            '-framerate',
            String(FPS),
            '-i',
            inputPattern,
            '-vf',
            'palettegen=max_colors=256:stats_mode=diff',
            palettePath,
        ],
        { stdio: 'pipe' }
    );

    // Pass 2: Encode with palette
    execFileSync(
        'ffmpeg',
        [
            '-y',
            '-framerate',
            String(FPS),
            '-i',
            inputPattern,
            '-i',
            palettePath,
            '-lavfi',
            'paletteuse=dither=sierra2_4a',
            outputPath,
        ],
        { stdio: 'pipe' }
    );

    const sizeKB = Math.round(readFileSync(outputPath).length / 1024);
    console.log(`         ${sizeKB} KB`);
}

/**
 * H.264 MP4 encoding with 8-bit chiptune music.
 *
 * @param {string} slug - Output file name (without extension).
 * @param {string} inputPattern - ffmpeg input frame pattern.
 * @param {object} category - Category object.
 */
function encodeMp4(slug, inputPattern, category) {
    const outputPath = join(OUTPUT_DIR, `${slug}.mp4`);
    console.log(`  🎥 Encoding MP4: ${slug}.mp4`);

    if (noMusic) {
        // Silent MP4
        execFileSync(
            'ffmpeg',
            [
                '-y',
                '-framerate',
                String(FPS),
                '-i',
                inputPattern,
                '-c:v',
                'libx264',
                '-pix_fmt',
                'yuv420p',
                '-crf',
                '18',
                '-preset',
                'slow',
                '-movflags',
                '+faststart',
                '-vf',
                'pad=ceil(iw/2)*2:ceil(ih/2)*2',
                outputPath,
            ],
            { stdio: 'pipe' }
        );
    } else {
        // Step 1: Encode silent video to temp file
        const silentPath = join(FRAMES_DIR, `${slug}-silent.mp4`);
        execFileSync(
            'ffmpeg',
            [
                '-y',
                '-framerate',
                String(FPS),
                '-i',
                inputPattern,
                '-c:v',
                'libx264',
                '-pix_fmt',
                'yuv420p',
                '-crf',
                '18',
                '-preset',
                'slow',
                '-movflags',
                '+faststart',
                '-vf',
                'pad=ceil(iw/2)*2:ceil(ih/2)*2',
                silentPath,
            ],
            { stdio: 'pipe' }
        );

        // Step 2: Get music and compute duration
        const tunePath = ensureMusic();
        const duration = computeDuration(category);
        const fadeOutStart = Math.max(0, duration - 2);

        // Step 3: Mux video + music (trimmed to video length, with fade in/out)
        execFileSync(
            'ffmpeg',
            [
                '-y',
                '-i',
                silentPath,
                '-i',
                tunePath,
                '-c:v',
                'copy',
                '-c:a',
                'aac',
                '-b:a',
                '128k',
                '-af',
                `atrim=0:${duration.toFixed(2)},afade=t=in:d=1,afade=t=out:st=${fadeOutStart.toFixed(2)}:d=2`,
                '-shortest',
                '-movflags',
                '+faststart',
                outputPath,
            ],
            { stdio: 'pipe' }
        );
    }

    const sizeKB = Math.round(readFileSync(outputPath).length / 1024);
    console.log(`         ${sizeKB} KB`);
}

/** Remove temp frames directory. */
function cleanFrames() {
    if (existsSync(FRAMES_DIR)) {
        rmSync(FRAMES_DIR, { recursive: true });
    }
}

/** List generated output files with sizes. */
function listOutput() {
    const files = readdirSync(OUTPUT_DIR)
        .filter((f) => f.endsWith('.gif') || f.endsWith('.mp4'))
        .sort();
    if (files.length === 0) return;

    console.log('📁 Output files:');
    for (const f of files) {
        const sizeKB = Math.round(readFileSync(join(OUTPUT_DIR, f)).length / 1024);
        const sizeMB = (sizeKB / 1024).toFixed(1);
        console.log(`   ${f.padEnd(40)} ${sizeKB > 1024 ? sizeMB + ' MB' : sizeKB + ' KB'}`);
    }
}

// ─────────────────────────────────────────────────────────
main().catch((err) => {
    console.error('\n❌ Fatal error:', err.message);
    cleanFrames();
    process.exit(1);
});
