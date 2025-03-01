import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

let signalingConnection;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

function connectToSignalingServer() {
  // Replace with your actual connection logic
  signalingConnection = new WebSocket('wss://your-server-url');
  
  signalingConnection.onopen = () => {
    console.log('Connected to signaling server');
    reconnectAttempts = 0;
  };
  
  signalingConnection.onclose = () => {
    console.log('Disconnected from signaling server');
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
