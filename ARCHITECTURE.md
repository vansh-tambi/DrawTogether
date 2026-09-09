# DrawTogether Architecture

This document describes the design and architectural structure of the **DrawTogether** real-time collaborative drawing application.

## Overview

DrawTogether uses a lightweight, framework-less client architecture combined with a Node.js server using native WebSockets (`ws`).

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser Client                           │
│  ┌────────────────────┐      ┌───────────────────────────┐  │
│  │ HTML5 Canvas       │      │ WebSocket Client          │  │
│  │ (Full-Bleed 2D)    │      │ (native Browser WebSocket)│  │
│  └─────────┬──────────┘      └──────────────┬────────────┘  │
└────────────┼────────────────────────────────┼───────────────┘
             │                                │
             │ User Drawing Events            │ Bidirectional Messages
             ▼                                ▼
┌─────────────────────────────────────────────────────────────┐
│                    Node.js Server                           │
│  ┌────────────────────┐      ┌───────────────────────────┐  │
│  │ Plain HTTP Server  │      │ Native WebSocketServer    │  │
│  │ (Static Assets)    │      │ (ws package)              │  │
│  └────────────────────┘      └──────────────┬────────────┘  │
│                                             │               │
│                  ┌──────────────────────────┴─────────────┐ │
│                  │ RoomManager & DrawingStateManager      │ │
│                  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## System Components

### 1. Client Layer (`/client`)

- **`index.html`**: The HTML container providing the `<canvas>` viewport with `<title>DrawTogether</title>`.
- **`style.css`**: CSS stylesheet ensuring a full-bleed viewport (`100vw` by `100vh`) with zero margins/padding.
- **`canvas.ts`**: Manages the `<canvas>` 2D rendering context, handling high-DPI (`devicePixelRatio`) scaling and dynamic window resizing.
- **`websocket.ts`**: Encapsulates native browser `WebSocket` logic, managing event listeners for connection lifecycle (`open`, `message`, `close`, `error`).
- **`main.ts`**: Client entry point initializing the canvas manager and opening the WebSocket connection upon DOM loading.

### 2. Server Layer (`/server`)

- **`server.ts`**:
  - Initializes a Node.js `http` server for delivering bundled static assets from `/dist`.
  - Attaches a native `WebSocketServer` instance from the `ws` package on port 3000.
  - Logs client connections, incoming messages, disconnections, and errors.
- **`rooms.ts`**: Stub module for managing collaborative room instances and client grouping.
- **`drawing-state.ts`**: Stub module for recording stroke history and room canvas state.

### 3. Protocol & Communication

- Communication is handled via JSON-encoded binary/string frames over native WebSockets.
- On connection, the server sends a `{ type: 'WELCOME', clientId, message }` payload.
- Future message payloads will include drawing events (stroke start, path point, stroke end, clear, undo).

## Build & Tooling Setup

- **TypeScript Strict Mode**: Configured in `tsconfig.json` with `"strict": true`.
- **Bundler**: Vite builds the client bundle for production and runs the HMR dev server during development.
- **Runtime**: `tsx` executes TypeScript server files directly without an extra build step during development.
