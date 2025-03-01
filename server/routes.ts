import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import type { WebRTCMessage } from "@shared/schema";
import { log } from "./vite";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  // Use a different path to avoid conflicts with Vite
  const wss = new WebSocketServer({ server: httpServer, path: '/rtc-signal' });
  const rooms = new Map<string, Set<WebSocket>>();

  wss.on('connection', (ws, req) => {
    let currentRoom: string | null = null;

    log(`WebSocket connected from ${req.headers.origin}`, 'websocket');

    // Send initial connection acknowledgment
    ws.send(JSON.stringify({ type: 'connected' }));

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        log(`Received message type: ${message.type}`, 'websocket');

        switch (message.type) {
          case 'join-room': {
            const roomId = message.roomId;
            log(`Client joining room: ${roomId}`, 'websocket');

            // Leave current room if in one
            if (currentRoom && rooms.has(currentRoom)) {
              rooms.get(currentRoom)!.delete(ws);
            }

            // Join new room
            currentRoom = roomId;
            if (!rooms.has(roomId)) {
              rooms.set(roomId, new Set());
            }
            rooms.get(roomId)!.add(ws);

            // Notify client about successful room join
            ws.send(JSON.stringify({ 
              type: 'room-joined',
              roomId,
              peers: rooms.get(roomId)!.size
            }));

            log(`Client joined room: ${roomId} (${rooms.get(roomId)!.size} peers)`, 'websocket');
            break;
          }

          case 'webrtc': {
            if (!currentRoom) {
              log('Received WebRTC message but client is not in a room', 'websocket');
              return;
            }

            const rtcMessage = message.data as WebRTCMessage;
            log(`Relaying ${rtcMessage.type} message in room ${currentRoom}`, 'websocket');

            // Relay message to all other clients in the room
            rooms.get(currentRoom)!.forEach((client) => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(rtcMessage));
              }
            });
            break;
          }
        }
      } catch (error) {
        log(`WebSocket message error: ${error}`, 'websocket');
        ws.send(JSON.stringify({ 
          type: 'error',
          message: 'Failed to process message'
        }));
      }
    });

    ws.on('error', (error) => {
      log(`WebSocket error: ${error}`, 'websocket');
    });

    ws.on('close', () => {
      if (currentRoom && rooms.has(currentRoom)) {
        rooms.get(currentRoom)!.delete(ws);
        log(`Client left room: ${currentRoom}`, 'websocket');

        // Notify remaining peers about departure
        rooms.get(currentRoom)!.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ 
              type: 'peer-left',
              roomId: currentRoom
            }));
          }
        });

        // Clean up empty rooms
        if (rooms.get(currentRoom)!.size === 0) {
          rooms.delete(currentRoom);
          log(`Room ${currentRoom} deleted (empty)`, 'websocket');
        }
      }
    });
  });

  return httpServer;
}