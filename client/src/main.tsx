import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

let signalingConnection;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
let keepAliveInterval;
let peerConnection;
let roomId;
let localStream;

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
  
  signalingConnection.onmessage = (event) => {
    const message = JSON.parse(event.data);
    console.log('Received message:', message);
    
    switch(message.type) {
      case 'welcome':
        console.log('Connected to signaling server');
        break;
        
      case 'offer':
        if (message.roomId === roomId) {
          handleOffer(message.offer);
        }
        break;
        
      case 'answer':
        if (message.roomId === roomId) {
          handleAnswer(message.answer);
        }
        break;
        
      case 'ice-candidate':
        if (message.roomId === roomId) {
          handleIceCandidate(message.candidate);
        }
        break;
        
      case 'ping':
        // Just a keep-alive, no action needed
        break;
        
      default:
        console.log('Unknown message type:', message.type);
    }
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

// Add these WebRTC functions
async function joinRoom(id) {
  roomId = id;
  console.log(`Joining room: ${roomId}`);
  
  // Get local media stream
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.getElementById('localVideo').srcObject = localStream;
    
    // Create peer connection
    createPeerConnection();
    
    // Add local tracks to peer connection
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });
    
    // Send join message to signaling server
    signalingConnection.send(JSON.stringify({
      type: 'join',
      roomId: roomId
    }));
    
    // Create offer if we're the first to join
    setTimeout(() => {
      createOffer();
    }, 1000);
    
  } catch (error) {
    console.error('Error accessing media devices:', error);
  }
}

function createPeerConnection() {
  // STUN servers for NAT traversal
  const configuration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };
  
  peerConnection = new RTCPeerConnection(configuration);
  
  // Handle ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      signalingConnection.send(JSON.stringify({
        type: 'ice-candidate',
        roomId: roomId,
        candidate: event.candidate
      }));
    }
  };
  
  // Handle connection state changes
  peerConnection.onconnectionstatechange = (event) => {
    console.log('Connection state:', peerConnection.connectionState);
  };
  
  // Handle receiving remote tracks
  peerConnection.ontrack = (event) => {
    console.log('Received remote track');
    document.getElementById('remoteVideo').srcObject = event.streams[0];
  };
}

async function createOffer() {
  try {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    
    signalingConnection.send(JSON.stringify({
      type: 'offer',
      roomId: roomId,
      offer: offer
    }));
  } catch (error) {
    console.error('Error creating offer:', error);
  }
}

async function handleOffer(offer) {
  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    
    signalingConnection.send(JSON.stringify({
      type: 'answer',
      roomId: roomId,
      answer: answer
    }));
  } catch (error) {
    console.error('Error handling offer:', error);
  }
}

async function handleAnswer(answer) {
  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  } catch (error) {
    console.error('Error handling answer:', error);
  }
}

async function handleIceCandidate(candidate) {
  try {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (error) {
    console.error('Error adding ICE candidate:', error);
  }
}

createRoot(document.getElementById("root")!).render(<App />);
