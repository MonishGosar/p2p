import { useEffect, useRef, useState } from "react";
import { useToast } from "./use-toast";
import type { WebRTCMessage } from "@shared/schema";

const config = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export function useWebRTC(roomId: string) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const { toast } = useToast();

  // Step 1: Setup WebSocket connection
  useEffect(() => {
    if (!roomId) return;

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}/rtc-signal`;

    console.log("Connecting to signaling server...");
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log("WebSocket connected");
      // Start media access after WebSocket is connected
      getMedia();
    };

    ws.current.onclose = () => {
      console.log("WebSocket disconnected");
      setIsConnected(false);
      toast({
        title: "Connection lost",
        description: "Lost connection to signaling server",
        variant: "destructive",
      });
    };

    ws.current.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    ws.current.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log("Received message:", message.type);

        switch (message.type) {
          case 'connected':
            console.log("Connected to signaling server");
            ws.current?.send(JSON.stringify({ type: "join-room", roomId }));
            break;

          case 'room-joined':
            console.log(`Joined room: ${message.roomId} with ${message.peers} peers`);
            break;

          case 'peer-left':
            setRemoteStream(null);
            setIsConnected(false);
            break;

          default:
            if (message.type === 'webrtc') {
              handleWebRTCMessage(message);
            }
        }
      } catch (error) {
        console.error("Failed to process message:", error);
      }
    };

    return () => {
      ws.current?.close();
      cleanupWebRTC();
    };
  }, [roomId]);

  // Step 2: Get user media
  async function getMedia() {
    try {
      console.log("Requesting media access...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      console.log("Media access granted");
      setLocalStream(stream);
      setupWebRTC(stream);
    } catch (error: any) {
      console.error("Media Error:", error);
      toast({
        title: "Camera/Microphone Error",
        description: error.name === "NotAllowedError"
          ? "Please allow camera and microphone access when prompted"
          : "Could not access camera or microphone",
        variant: "destructive",
      });
    }
  }

  // Step 3: Setup WebRTC
  function setupWebRTC(stream: MediaStream) {
    console.log("Setting up WebRTC connection");
    const pc = new RTCPeerConnection(config);
    peerConnection.current = pc;

    // Add local tracks
    stream.getTracks().forEach(track => {
      console.log(`Adding ${track.kind} track to peer connection`);
      pc.addTrack(track, stream);
    });

    // Handle remote tracks
    pc.ontrack = (event) => {
      console.log("Received remote track");
      setRemoteStream(event.streams[0]);
      setIsConnected(true);
    };

    // Send ICE candidates
    pc.onicecandidate = ({ candidate }) => {
      if (candidate && ws.current?.readyState === WebSocket.OPEN) {
        console.log("Sending ICE candidate");
        ws.current.send(JSON.stringify({
          type: "webrtc",
          data: {
            type: "ice-candidate",
            from: roomId,
            to: "all",
            payload: candidate,
          },
        }));
      }
    };

    // Create offer when connection is established
    pc.onnegotiationneeded = async () => {
      try {
        console.log("Creating offer");
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        ws.current?.send(JSON.stringify({
          type: "webrtc",
          data: {
            type: "offer",
            from: roomId,
            to: "all",
            payload: offer,
          },
        }));
      } catch (error) {
        console.error("Error creating offer:", error);
      }
    };
  }

  // Handle incoming WebRTC messages
  async function handleWebRTCMessage(message: any) {
    if (!peerConnection.current) return;

    try {
      const { type, payload } = message.data;
      console.log("Handling WebRTC message:", type);

      switch (type) {
        case "offer":
          await peerConnection.current.setRemoteDescription(payload);
          const answer = await peerConnection.current.createAnswer();
          await peerConnection.current.setLocalDescription(answer);

          ws.current?.send(JSON.stringify({
            type: "webrtc",
            data: {
              type: "answer",
              from: roomId,
              to: message.data.from,
              payload: answer,
            },
          }));
          break;

        case "answer":
          await peerConnection.current.setRemoteDescription(payload);
          break;

        case "ice-candidate":
          await peerConnection.current.addIceCandidate(payload);
          break;
      }
    } catch (error) {
      console.error("WebRTC message handling error:", error);
    }
  }

  function cleanupWebRTC() {
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    setLocalStream(null);
    setRemoteStream(null);
    setIsConnected(false);
  }

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsVideoEnabled(!isVideoEnabled);
    }
  };

  return {
    localStream,
    remoteStream,
    isConnected,
    isMuted,
    isVideoEnabled,
    toggleMute,
    toggleVideo,
  };
}