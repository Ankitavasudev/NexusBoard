# NexusBoard

> Real-time collaborative whiteboard with drawing, text, shapes, and team collaboration features.

[![CI](https://github.com/Ankitavasudev/NexusBoard/actions/workflows/ci.yml/badge.svg)](https://github.com/Ankitavasudev/NexusBoard/actions)
[![React 18](https://img.shields.io/badge/react-18-61DAFB.svg)](https://reactjs.org)
[![Node.js 18](https://img.shields.io/badge/node.js-18-339933.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## Features

- **Real-time Drawing** - Canvas-based drawing with smooth rendering
- **Shape Tools** - Rectangles, circles, lines, arrows, polygons
- **Text Annotations** - Add text labels anywhere on the canvas
- **Color Palette** - Full color picker with opacity control
- **Undo/Redo** - Complete history management
- **Export** - PNG, SVG, PDF export options
- **Collaboration** - Real-time multi-user editing (WebSocket)
- **Templates** - Pre-built templates for common workflows

## Demo

```
┌─────────────────────────────────────────────────────────┐
│  NexusBoard - Collaborative Whiteboard                  │
├─────────────────────────────────────────────────────────┤
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐        │
│  │ ✏️   │ │ 📐  │ │ 🔤  │ │ 🎨  │ │ 📥  │        │
│  │ Draw │ │Shape │ │ Text │ │Color │ │Export│        │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘        │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │                                                 │   │
│  │    ┌─────────┐        ┌─────────┐              │   │
│  │    │  User1  │ ←────→ │  User2  │              │   │
│  │    └─────────┘        └─────────┘              │   │
│  │         │                    │                  │   │
│  │         └────────┬───────────┘                  │   │
│  │                  ↓                              │   │
│  │         Real-time Canvas                        │   │
│  │                                                 │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Users Online: 3 | Objects: 47 | History: 128 steps    │
└─────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## API Usage

```javascript
// Add a shape
const shape = {
  type: 'rectangle',
  x: 100,
  y: 100,
  width: 200,
  height: 150,
  fill: '#4A90D9',
  stroke: '#2C5F8A'
};

// Add text
const text = {
  type: 'text',
  x: 150,
  y: 175,
  content: 'Hello World',
  fontSize: 24,
  color: '#333333'
};

// Export canvas
const exportData = canvas.export('png'); // Returns base64
```

## Architecture

```
NexusBoard/
├── src/
│   ├── components/
│   │   ├── Canvas.jsx           # Main drawing canvas
│   │   ├── Toolbar.jsx          # Tool selection
│   │   ├── ColorPicker.jsx      # Color selection
│   │   ├── LayersPanel.jsx      # Layer management
│   │   └── UsersPanel.jsx       # Active users
│   ├── hooks/
│   │   ├── useCanvas.js         # Canvas logic
│   │   ├── useHistory.js        # Undo/redo
│   │   └── useWebSocket.js      # Real-time sync
│   ├── utils/
│   │   ├── shapes.js            # Shape utilities
│   │   ├── export.js            # Export functions
│   │   └── collaboration.js     # Sync logic
│   └── styles/
│       └── globals.css          # TailwindCSS styles
├── server/
│   ├── index.js                 # Express server
│   ├── websocket.js             # WebSocket handler
│   └── storage.js               # Session storage
└── .github/workflows/           # CI/CD pipeline
```

## Tech Stack

- **Frontend**: React 18, Canvas API, TailwindCSS
- **Backend**: Node.js, Express, WebSocket
- **State**: Zustand (lightweight state management)
- **Export**: html2canvas, jsPDF
- **CI/CD**: GitHub Actions

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Add tests for new features
4. Ensure all tests pass (`npm test`)
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) for details.