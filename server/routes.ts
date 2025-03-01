import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import { setupAuth } from "./auth";
import { WebSocket } from "ws";
import { storage } from "./storage";
import type { WebRTCMessage } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);
  const httpServer = createServer(app);
  
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  const rooms = new Map<string, Set<WebSocket>>();
  
  wss.on('connection', (ws) => {
    let currentRoom: string | null = null;

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'join-room':
          currentRoom = message.roomId;
          if (!rooms.has(currentRoom)) {
            rooms.set(currentRoom, new Set());
          }
          rooms.get(currentRoom)!.add(ws);
          break;
          
        case 'leave-room':
          if (currentRoom && rooms.has(currentRoom)) {
            rooms.get(currentRoom)!.delete(ws);
            if (rooms.get(currentRoom)!.size === 0) {
              rooms.delete(currentRoom);
            }
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
      }
    });

    ws.on('close', () => {
      if (currentRoom && rooms.has(currentRoom)) {
        rooms.get(currentRoom)!.delete(ws);
        if (rooms.get(currentRoom)!.size === 0) {
          rooms.delete(currentRoom);
        }
      }
    });
  });

  return httpServer;
}
