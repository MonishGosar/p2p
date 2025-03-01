import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import http from "http";
import { WebSocketServer } from 'ws';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Create HTTP server explicitly
const httpServer = http.createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server: httpServer });

// Update the WebSocket connection handling
const rooms = new Map();

wss.on('connection', (ws) => {
  console.log('Client connected to signaling server');
  let clientRoomId = null;
  
  // Send a welcome message
  ws.send(JSON.stringify({ type: 'welcome', message: 'Connected to signaling server' }));
  
  // Handle messages from clients
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('Received message:', data);
      
      // Handle different message types
      switch(data.type) {
        case 'join':
          clientRoomId = data.roomId;
          if (!rooms.has(clientRoomId)) {
            rooms.set(clientRoomId, new Set());
          }
          rooms.get(clientRoomId).add(ws);
          console.log(`Client joined room: ${clientRoomId}`);
          break;
          
        case 'offer':
        case 'answer':
        case 'ice-candidate':
          // Forward to all clients in the same room
          if (clientRoomId && rooms.has(clientRoomId)) {
            rooms.get(clientRoomId).forEach((client) => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
              }
            });
          }
          break;
          
        case 'ping':
          // Just a keep-alive, send pong
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
          
        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });
  
  // Handle disconnection
  ws.on('close', () => {
    console.log('Client disconnected from signaling server');
    // Remove from rooms
    if (clientRoomId && rooms.has(clientRoomId)) {
      rooms.get(clientRoomId).delete(ws);
      if (rooms.get(clientRoomId).size === 0) {
        rooms.delete(clientRoomId);
      }
    }
  });
});

// Add CORS headers for WebRTC signaling
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Get port from environment variable or use default
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Use the HTTP server instead of app.listen
  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
    console.log(`WebRTC signaling server active on ws://0.0.0.0:${port}`);
  });

  // Add graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    httpServer.close(() => {
      console.log('HTTP server closed');
    });
  });
})();