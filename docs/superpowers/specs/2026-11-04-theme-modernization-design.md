# Theme Modernization Design Specification

**Date:** 2026-11-04  
**Status:** Implemented  
**Topic:** Dark Mode v3.0 (Aura Nexus Aesthetic 2025) & Light Mode v1.0 (Clean Modern Minimalist)  
**Target:** `frontend/src/index.css` & component theme remapping

---

## 1. Overview & Goals

The goal of this redesign is to replace the legacy "Military/Tactical Brutalist" theme (characterized by 0px square corners, army-olive `#141612`/orange hues, and forced `UPPERCASE` text) with modern, elegant design systems matching the user-provided moodboards:
1. **Dark Theme ("Cyber Aura Nexus v3.0 - Aesthetic 2025")**:
   - Deep cosmic midnight background (`#060A14`).
   - Frosted translucent glass panels (`rgba(13, 21, 38, 0.85)` with `backdrop-filter: blur(12px)`).
   - Cyberpunk gradient accents (Electric Violet `#7C3AED` ➔ Neon Cyan `#00F0FF`).
   - Soft neon glow borders and interactive hover effects.
   - Smooth modern curvature (`border-radius: 10px–14px`).
2. **Light Theme ("Light Mode UI Kit v1.0 - Clean Minimalist")**:
   - Soft neutral light/cream canvas (`#F8F9FA` / `#F4F5F7`).
   - Crisp white cards (`#FFFFFF`) with delicate drop shadows (`0 4px 16px rgba(0, 0, 0, 0.04)`).
   - Vibrant Royal Blue primary accent (`#0047FF` / `#0B3BFF`) and warm neutral/coral secondary touches.
   - Balanced contrast text (`#0F172A` / `#64748B`).
   - Smooth modern curvature (`border-radius: 10px–14px`).

---

## 2. Design Tokens & Color Palettes

### 2.1 CSS Variables (`:root` — Dark Cyber Aura Nexus)

```css
:root {
  /* Surface & Backgrounds */
  --bg-main: #060a14;
  --card-bg: rgba(13, 21, 38, 0.85);
  --card-border: rgba(56, 189, 248, 0.22);
  --sidebar-bg: rgba(9, 15, 28, 0.9);
  --nav-bg: rgba(9, 15, 28, 0.85);
  --input-bg: #0a1020;
  --modal-bg: #0d1527;

  /* Typography */
  --text-main: #f8fafc;
  --text-muted: #94a3b8;
  --text-inverse: #060a14;

  /* Primary Accents & Gradients */
  --accent-primary: #7c3aed;
  --accent-cyan: #00f0ff;
  --accent-magenta: #ec4899;
  --accent-gradient: linear-gradient(135deg, #7c3aed 0%, #00f0ff 100%);
  --accent-glow: 0 0 16px rgba(124, 58, 237, 0.35);
  --cyan-glow: 0 0 14px rgba(0, 240, 255, 0.25);

  /* Message Bubbles */
  --user-msg-bg: rgba(124, 58, 237, 0.18);
  --user-msg-border: rgba(124, 58, 237, 0.45);
  --ai-msg-bg: rgba(13, 21, 38, 0.8);
  --ai-msg-border: rgba(56, 189, 248, 0.2);

  /* Radii */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 18px;
  --radius-pill: 9999px;

  /* Shadows */
  --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.4);
  --shadow-md: 0 4px 16px rgba(0, 0, 0, 0.5);
  --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.6);

  /* Transitions */
  --transition-fast: 0.15s ease-out;
  --transition-normal: 0.25s ease-out;
}
```

### 2.2 CSS Variables (`[data-theme='light']` — Light Mode UI Kit v1.0)

```css
[data-theme='light'] {
  /* Surface & Backgrounds */
  --bg-main: #f8f9fa;
  --card-bg: #ffffff;
  --card-border: #e2e8f0;
  --sidebar-bg: #ffffff;
  --nav-bg: #ffffff;
  --input-bg: #ffffff;
  --modal-bg: #ffffff;

  /* Typography */
  --text-main: #0f172a;
  --text-muted: #64748b;
  --text-inverse: #ffffff;

  /* Primary Accents */
  --accent-primary: #0047ff;
  --accent-cyan: #0284c7;
  --accent-magenta: #e11d48;
  --accent-gradient: linear-gradient(135deg, #0047ff 0%, #2563eb 100%);
  --accent-glow: 0 4px 12px rgba(0, 71, 255, 0.2);
  --cyan-glow: 0 2px 8px rgba(2, 132, 199, 0.15);

  /* Message Bubbles */
  --user-msg-bg: #eef2ff;
  --user-msg-border: #c7d2fe;
  --ai-msg-bg: #ffffff;
  --ai-msg-border: #e2e8f0;

  /* Shadows */
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 16px rgba(0, 0, 0, 0.05);
  --shadow-lg: 0 10px 30px rgba(0, 0, 0, 0.08);
}
```

---

## 3. Component Styling & Behavior

### 3.1 Typography & Casing
- Remove all `text-transform: uppercase` rules across body, headings, buttons, links, navigation brand, and conversation cards.
- Adopt modern clean casing (Title Case / Sentence Case).
- Headings: Crisp font weight (`600` / `700`) with smooth margins and subtle bottom border accent.

### 3.2 Buttons
- `.btn`: `border-radius: var(--radius-md) !important; font-weight: 500; transition: all var(--transition-fast);`.
- `.btn-accent` & `.btn-primary`:
  - **Dark**: `background: var(--accent-gradient); border: none; color: #ffffff; box-shadow: var(--accent-glow);`. On hover: brighter gradient + enhanced cyan-violet glow.
  - **Light**: `background: #0047ff; border: none; color: #ffffff; box-shadow: var(--accent-glow);`. On hover: `background: #0038cc;`.
- Outline buttons (`.btn-outline-*`):
  - **Dark**: semi-transparent background, subtle cyan/violet border, hover glow.
  - **Light**: neutral light-grey background `#F1F5F9`, border `#E2E8F0`, hover `#E2E8F0`.

### 3.3 Inputs & Selects (`.form-control`, `.form-select`)
- `border-radius: var(--radius-md) !important`.
- Clean padding and placeholder styling.
- **Dark**: Background `#0A1020`, border `rgba(56, 189, 248, 0.25)`. Focus: border `#7C3AED`, focus ring `0 0 0 3px rgba(124, 58, 237, 0.35)`.
- **Light**: Background `#FFFFFF`, border `#CBD5E1`. Focus: border `#0047FF`, focus ring `0 0 0 3px rgba(0, 71, 255, 0.15)`.

### 3.4 Panels, Cards & Modals
- `.glass-panel`:
  - `border-radius: var(--radius-lg); background: var(--card-bg); border: 1px solid var(--card-border); box-shadow: var(--shadow-md); backdrop-filter: blur(12px);`.
- Bootstrap remapping:
  - `.card`, `.modal-content`: dynamically mapped to `--card-bg`, `--card-border`, `--text-main`.
  - In Light mode: `.bg-dark` and `.text-light` are smoothly remapped to `--card-bg` and `--text-main` so all existing modal headers, bodies, footers, and cards automatically present flawless light mode aesthetics.

### 3.5 Sidebar & Conversation Cards
- `.sidebar-wrapper`: modern rounded container (`border-radius: var(--radius-lg)`), clean padding, custom scrollbar.
- `.conversation-card`:
  - `border-radius: var(--radius-md); padding: 0.75rem 1rem; border: 1px solid var(--card-border);`.
  - Normal case, clean truncated text.
  - Active state:
    - **Dark**: gradient or soft violet fill `rgba(124, 58, 237, 0.25)`, border `rgba(0, 240, 255, 0.5)`, cyan-violet text accent.
    - **Light**: soft royal-blue fill `#EFF6FF`, border `#3B82F6`, royal blue text `#1D4ED8`.

### 3.6 Chat Messages & Stream
- `.message-bubble`:
  - `border-radius: var(--radius-lg); padding: 1rem 1.25rem;`.
  - `.user`: aligned right, rounded bubble with user background and accent border.
  - `.assistant`: aligned left, rounded bubble with assistant background and subtle border.
- `.typing-indicator`: Replace console-like blinking `PROCESSING...` with smooth animated pulsing dots or modern glowing wave.

---

## 4. Verification & Testing Strategy

1. **Unit & Component Testing:**
   - Run Vitest suite: `npm test --prefix frontend` (all 53 test suites must pass).
   - Ensure tests relying on text casing or theme attributes continue to pass without regression.
2. **Linting:**
   - Run `npm run --prefix frontend lint` (0 errors).
3. **Bundle Size:**
   - Run `npm run --prefix frontend build` (must stay under the strict 180 KB budget limit; expected change is purely CSS, ~0 KB JS overhead).
4. **Live Container & Browser Verification:**
   - Rebuild Docker container `frontend`: `docker compose up -d --build frontend`.
   - Verify `http://localhost:3000/` responds `200 OK`.
   - Verify theme toggle button transitions smoothly between Dark Cyber Aura Nexus and Light Minimalist.
