# Chat UI Design

## Goal

Make the chat interface clear, calm, and work-focused by removing decorative AI-style patterns without changing behavior or data flow.

## Visual Direction

- Use a light neutral canvas (`#f6f7f9`) with white panels and subtle gray dividers.
- Use one restrained blue accent for active navigation, links, focus states, and sending.
- Remove sparkle branding, emoji section labels, marketing subtitles, oversized shadows, and excessive rounded cards.
- Keep moderate corner radii only where they communicate grouping.
- Use dark text for primary content and muted gray for metadata.

## Chat Changes

- Compact the conversation header while keeping title, description, privacy state, and search.
- Render messages as a clean timeline rather than colored message bubbles.
- Keep message actions available on hover, but make them visually quiet.
- Use a white bordered composer with a compact send button.
- Shorten empty states to direct, useful copy.

## Sidebar Changes

- Reduce visual weight and width while preserving all navigation and conversation groups.
- Replace large blue active rows with a subtle blue-tinted row and left accent line.
- Remove decorative emoji and promotional Telegram copy.
- Keep user status, logout, search, create actions, unread counts, and routes unchanged.

## Constraints

- No changes to services, types, routing, authentication, or chat behavior.
- Preserve mobile usability, truncation, focus states, and readable contrast.
- Verify with the existing test suite and production build.
