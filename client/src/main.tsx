import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

let signalingConnection;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
let keepAliveInterval;

function connectToSignalingServer() {
  // Use the current host with secure WebSocket protocol
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const wsUrl = `${protocol}//${host}`;
  
  console.log(`Connecting to signaling server at ${wsUrl}`);
  signalingConnection = new WebSocket(wsUrl);
  
  signalingConnection.onopen = () => {
    console.log('Connected to signaling server');
    reconnectAttempts = 0;
    
    // Set up keep-alive ping every 30 seconds
    keepAliveInterval = setInterval(() => {
      if (signalingConnection.readyState === WebSocket.OPEN) {
        signalingConnection.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  };
  
  signalingConnection.onclose = () => {
    console.log('Disconnected from signaling server');
    clearInterval(keepAliveInterval);
    attemptReconnect();
  };
  
  signalingConnection.onerror = (error) => {
    console.error('Signaling connection error:', error);
  };
}

function attemptReconnect() {
  if (reconnectAttempts < maxReconnectAttempts) {
    reconnectAttempts++;
    const timeout = Math.min(1000 * reconnectAttempts, 5000);
    console.log(`Attempting to reconnect in ${timeout/1000} seconds...`);
    
    setTimeout(() => {
      connectToSignalingServer();
    }, timeout);
  } else {
    console.error('Max reconnection attempts reached');
    // Show UI error to user
  }
}

// Initial connection
connectToSignalingServer();

createRoot(document.getElementById("root")!).render(<App />);
