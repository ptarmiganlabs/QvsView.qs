# QvsView.qs — Quote Animations

Generate animated GIF and MP4 teasers from the QvsView.qs loading-screen quotes for social media promotion.

Each animation cycles through a category's quotes with smooth fades, bookended by a branded intro and logo/tagline outro. MP4s include an auto-generated 8-bit chiptune soundtrack.

## Prerequisites

- **Node.js** ≥ 18
- **ffmpeg** (`brew install ffmpeg`)

## Setup

```bash
cd quote-animations
npm ci
npx playwright install chromium
```

## Usage

```bash
# GIF only (default)
node generate.mjs

# MP4 with 8-bit chiptune
node generate.mjs --format mp4

# Both GIF and MP4
node generate.mjs --format all

# Single category
node generate.mjs --category yoda

# Single size
node generate.mjs --size 1080x1080

# Custom background music instead of chiptune
node generate.mjs --music path/to/track.mp3

# MP4 without audio
node generate.mjs --no-music
```

### npm scripts

| Script                 | Description                     |
| ---------------------- | ------------------------------- |
| `npm run generate`     | GIF only (all categories/sizes) |
| `npm run generate:mp4` | MP4 only (all categories/sizes) |
| `npm run generate:all` | Both GIF and MP4                |

## Output

Files are written to `output/`, named `{category}-{size}.{gif,mp4}`:

```
output/
  rocket-launch-1080x1080.gif
  rocket-launch-1080x1080.mp4
  yoda-800x450.gif
  …
```

### Sizes

| Label       | Dimensions  | Use case               |
| ----------- | ----------- | ---------------------- |
| `1080x1080` | 1080 × 1080 | Instagram, Facebook    |
| `800x450`   | 800 × 450   | Twitter/X, blog embeds |
| `1200x628`  | 1200 × 628  | LinkedIn, Open Graph   |

### Categories

8 categories with 5 quotes each (sourced from `src/ui/ai-modal.js`):

| Slug              | Theme                     |
| ----------------- | ------------------------- |
| `rocket-launch`   | 🚀 Rocket Launch Sequence |
| `yoda`            | 🧘 Yoda Wisdom            |
| `pirate`          | 🏴‍☠️ Pirate Adventure       |
| `mission-control` | 🎯 Mission Control        |
| `chef`            | 👨‍🍳 Gourmet Analysis       |
| `dramatic`        | 🎬 Dramatic / Pop Culture |
| `detective`       | 🔍 Detective Mystery      |
| `misc-fun`        | 🎲 Misc Fun               |

## Animation structure

Each animation follows this sequence:

1. **Intro slide** (3s hold) — small logo + "Meanwhile, while analyzing your Qlik script…"
2. **Quotes** (2s hold each) — icon + quote text with 0.3s fade transitions
3. **Logo slide** (4s hold) — full logo, tagline, "open source" badge, "Coming soon" teaser

## Chiptune generator

`generate-music.mjs` is a standalone 8-bit music synthesizer using NES-style waveforms (square, triangle, noise). It auto-generates a peppy chiptune track that gets trimmed and faded to match each video's duration.

```bash
# Generate standalone chiptune
node generate-music.mjs                     # 30s at 140 BPM
node generate-music.mjs --duration 20       # Custom length
node generate-music.mjs --bpm 160           # Faster tempo
node generate-music.mjs --output tune.wav   # Custom output path
```

## How it works

1. **Playwright** renders `template.html` in headless Chromium, capturing each frame as a PNG screenshot
2. **ffmpeg** encodes frames into optimized GIF (two-pass palette) or H.264 MP4
3. For MP4: chiptune audio is generated (or custom music loaded), trimmed to video duration with fade in/out, and muxed into the final file

## Files

| File                 | Purpose                                       |
| -------------------- | --------------------------------------------- |
| `generate.mjs`       | Main orchestrator — frame capture + encoding  |
| `generate-music.mjs` | 8-bit chiptune WAV synthesizer                |
| `template.html`      | Dark-themed HTML template for frame rendering |
| `package.json`       | Dependencies (playwright) and npm scripts     |
