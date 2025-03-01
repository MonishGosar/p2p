import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { setupAuth } from "./auth";
import type { WebRTCMessage } from "@shared/schema";
import { log } from "./vite";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  const rooms = new Map<string, Set<WebSocket>>();

  wss.on('connection', (ws, req) => {
    let currentRoom: string | null = null;

    log(`WebSocket connected: ${req.url}`, 'websocket');

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case 'join-room': {
            const roomId = message.roomId;
            if (typeof roomId !== 'string') {
              throw new Error('Invalid room ID');
            }

            currentRoom = roomId;
            if (!rooms.has(currentRoom)) {
              rooms.set(currentRoom, new Set());
            }
            rooms.get(currentRoom)!.add(ws);
            log(`Client joined room: ${roomId}`, 'websocket');
            break;
          }

          case 'leave-room':
            if (currentRoom && rooms.has(currentRoom)) {
              rooms.get(currentRoom)!.delete(ws);
              if (rooms.get(currentRoom)!.size === 0) {
                rooms.delete(currentRoom);
              }
              log(`Client left room: ${currentRoom}`, 'websocket');
            }
            currentRoom = null;
            break;

          case 'webrtc':
            if (currentRoom && rooms.has(currentRoom)) {
              const rtcMessage = message.data as WebRTCMessage;
              rooms.get(currentRoom)!.forEach((peer) => {
                if (peer !== ws && peer.readyState === WebSocket.OPEN) {
                  peer.send(JSON.stringify(rtcMessage));
                }
              });
            }
            break;

          default:
            log(`Unknown message type: ${message.type}`, 'websocket');
        }
      } catch (error) {
        log(`WebSocket error: ${error}`, 'websocket');
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    ws.on('error', (error) => {
      log(`WebSocket error: ${error}`, 'websocket');
    });

    ws.on('close', () => {
      if (currentRoom && rooms.has(currentRoom)) {
        rooms.get(currentRoom)!.delete(ws);
        if (rooms.get(currentRoom)!.size === 0) {
          rooms.delete(currentRoom);
        }
        log(`Client disconnected from room: ${currentRoom}`, 'websocket');
      }
    });
  });

  return httpServer;
}