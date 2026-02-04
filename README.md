# F1 Multiplayer Racing Game

A realistic F1 multiplayer racing game offering high-speed action on the Monza circuit.

## Features
- **Realistic Physics**: Cannon.js physics tuned for F1 handling (high grip, downforce).
- **Multiplayer**: Socket.io based real-time position syncing.
- **Monza Circuit**: Accurate track layout.
- **Lap Timing**: Live lap timers and leaderboards.

## Setup

### Prerequisites
- Node.js (v16+)
- npm

### Installation

1. Client
   ```bash
   cd client
   npm install
   ```

2. Server
   ```bash
   cd server
   npm install
   ```

## Running the Game

1. Start the Server:
   ```bash
   cd server
   npm start
   ```

2. Start the Client:
   ```bash
   cd client
   npm run dev
   ```

3. Open `http://localhost:5173` (or the port shown by Vite).
