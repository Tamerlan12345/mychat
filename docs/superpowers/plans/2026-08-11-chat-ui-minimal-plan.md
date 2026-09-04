# Chat UI Minimal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing chat screen light, clear, and restrained by removing decorative AI-style visual patterns while preserving all behavior.

**Architecture:** Keep the existing Next.js component structure and service calls. Change the shared color foundation in `app/globals.css`, then update visual classes and copy in the sidebar, chat window, message item, and composer only.

**Tech Stack:** Next.js 14, React, TypeScript, Tailwind CSS, lucide-react, Vitest.

## Global Constraints

- No changes to services, types, routing, authentication, or chat behavior.
- Use a light neutral canvas (`#f6f7f9`) with white panels and subtle gray dividers.
- Use one restrained blue accent for active navigation, links, focus states, and sending.
- Remove sparkle branding, emoji section labels, marketing subtitles, oversized shadows, and excessive rounded cards.
- Preserve mobile usability, truncation, focus states, and readable contrast.

---

### Task 1: Light Visual Foundation

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx:6-9`

**Interfaces:**
- Produces the light page background and default typography used by all chat components.

- [ ] **Step 1: Replace dark root tokens and body defaults**

Set the page background to `#f6f7f9`, primary surface to white, border tone to `#e5e7eb`, and text defaults to a dark neutral. Keep the existing brand variable names so the branding provider remains compatible.

- [ ] **Step 2: Update document metadata**

Change the title and description to concise product copy without “Corporate Messenger” marketing language.

- [ ] **Step 3: Verify the CSS compiles**

Run: `npm run build`
Expected: build completes without TypeScript or CSS errors.

### Task 2: Simplify Sidebar

**Files:**
- Modify: `components/sidebar/sidebar.tsx`

**Interfaces:**
- Consumes the existing `Conversation`, auth, and navigation APIs unchanged.
- Produces the same sidebar interactions with a lighter visual hierarchy.

- [ ] **Step 1: Remove decorative branding and copy**

Replace the `Sparkles` brand mark with a simple neutral mark, remove the “Corporate Messenger” subtitle, and remove emoji from section labels.

- [ ] **Step 2: Restyle navigation surfaces**

Use white/gray surfaces, compact spacing, subtle borders, and a pale blue active row with a left accent rather than a full blue filled button. Preserve unread badges and click handlers.

- [ ] **Step 3: Make search and mode switching quiet**

Keep both tabs and search behavior, but remove dark backgrounds, colored Telegram treatment, and oversized rounded styling.

- [ ] **Step 4: Shorten Telegram and footer language**

Use direct labels such as “Telegram” and “Открыть” while retaining the existing `/telegram`, `/contacts`, `/settings`, and admin routes.

### Task 3: Refine Chat Timeline and Composer

**Files:**
- Modify: `components/chat/chat-window.tsx`
- Modify: `components/chat/message-item.tsx`
- Modify: `components/chat/message-input.tsx`

**Interfaces:**
- Consumes and returns the existing message, reaction, attachment, reply, edit, and delete callbacks unchanged.

- [ ] **Step 1: Restyle the conversation header**

Use a white compact header, a simple outlined conversation icon, subtle border, and dark text. Keep title, description, private lock, and search input behavior.

- [ ] **Step 2: Simplify message rows**

Use a clean white timeline row with muted hover state, less rounded geometry, dark readable body text, and quiet metadata. Keep attachment rendering, reactions, hover actions, edit state, and deletion opacity.

- [ ] **Step 3: Restyle reactions and action controls**

Keep the same controls and emoji list, but use small neutral bordered controls instead of dark floating cards and strong shadows.

- [ ] **Step 4: Simplify empty and search states**

Replace promotional empty-state wording with direct copy: `Выберите диалог` and `Сообщений пока нет` / `Ничего не найдено`.

- [ ] **Step 5: Restyle the composer**

Keep file upload, reply preview, validation error, Enter-to-send, and disabled behavior. Use a white bordered input row, muted attach button, and restrained blue send button.

### Task 4: Verification

**Files:**
- Verify: `app/globals.css`
- Verify: `components/sidebar/sidebar.tsx`
- Verify: `components/chat/chat-window.tsx`
- Verify: `components/chat/message-item.tsx`
- Verify: `components/chat/message-input.tsx`

- [ ] **Step 1: Run automated tests**

Run: `npm run test`
Expected: all existing Vitest tests pass.

- [ ] **Step 2: Run production build**

Run: `npm run build`
Expected: all existing routes compile successfully.

- [ ] **Step 3: Inspect the diff for scope**

Run: `git diff --check; git status --short`
Expected: no whitespace errors; only the intended UI files are modified besides the already committed design and plan documents.
