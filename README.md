# DrawTogether

A real-time collaborative drawing application built with TypeScript, HTML5 Canvas, Node.js HTTP server, and native WebSockets (`ws`).

## Features & Tech Stack

- **Client**: Plain TypeScript + HTML5 Canvas (no frontend framework), bundled with Vite.
- **Server**: Node.js + native `ws` WebSocket package + plain Node `http` server for static asset serving.
- **Type Safety**: Full TypeScript support with strict mode enabled across client and server.

## Project Structure

```
drawtogether/
├── client/
│   ├── index.html       # Application HTML shell (<title>DrawTogether</title>)
│   ├── style.css        # Full-bleed canvas styling
│   ├── canvas.ts        # HTML5 Canvas setup & DPR-aware responsive resizing
│   ├── websocket.ts     # Native WebSocket client setup & connection handling
│   └── main.ts          # Client entry point
├── server/
│   ├── server.ts        # Node.js plain HTTP & native `ws` WebSocket server
│   ├── rooms.ts         # Room management logic stub
│   └── drawing-state.ts # Drawing state & action history manager stub
├── package.json         # Dependencies and build/dev scripts
├── tsconfig.json        # TypeScript configuration with strict mode enabled
├── README.md            # Project documentation
└── ARCHITECTURE.md     # Architectural design & communication flow
```

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm

### Installation

```bash
npm install
```

### Running Development Server

To run both the server (watching TS files) and the client dev server simultaneously:

```bash
npm run dev
```

- Client Dev Server: `http://localhost:5173`
- Server (HTTP & WebSockets): `http://localhost:3000` / `ws://localhost:3000`

### Production Build & Start

To build the client assets and typecheck TypeScript:

```bash
npm run build
```

To run the production Node.js server:

```bash
npm run start
```

Open `http://localhost:3000` in your browser.
