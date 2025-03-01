import { useEffect, useRef, useState } from "react";
import { useToast } from "./use-toast";
import type { WebRTCMessage } from "@shared/schema";

const config = {
  iceServers: [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302",
      ],
    },
  ],
};

export function useWebRTC(roomId: string) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout>();
  const reconnectAttempts = useRef(0);
  const { toast } = useToast();

  // Setup media stream first before WebSocket connection
  useEffect(() => {
    let mounted = true;

    async function setupMedia() {
      try {
        // Check if we're in a secure context (HTTPS or localhost)
        if (!window.isSecureContext) {
          throw new Error("Video calls require a secure connection (HTTPS or localhost)");
        }

        // Check if getUserMedia is supported
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Your browser doesn't support video calls");
        }

        // Check permissions
        const permissions = await Promise.all([
          navigator.permissions.query({ name: 'camera' as PermissionName }),
          navigator.permissions.query({ name: 'microphone' as PermissionName })
        ]);

        if (permissions.some(p => p.state === 'denied')) {
          throw new Error("Camera or microphone access was denied");
        }

        // Get media stream
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: true
        });

        if (mounted) {
          setLocalStream(stream);
          setIsMuted(false);
          setIsVideoEnabled(true);
        }

      } catch (error: any) {
        console.error("Media Error:", error);
        let message = "Could not access camera or microphone. ";

        switch(error.name) {
          case 'NotFoundError':
            message += "No camera or microphone found.";
            break;
          case 'NotAllowedError':
            message += "Please allow camera and microphone access when prompted.";
            break;
          case 'OverconstrainedError':
            message += "Your camera doesn't meet the required quality settings.";
            break;
          default:
            message += error.message || "Please check your device settings.";
        }

        toast({
          title: "Camera/Microphone Error",
          description: message,
          variant: "destructive",
        });
      }
    }

    setupMedia();

    return () => {
      mounted = false;
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Setup WebSocket connection only after we have local media
  useEffect(() => {
    if (!roomId || !localStream) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    function connect() {
      if (isConnecting || ws.current?.readyState === WebSocket.CONNECTING) return;

      setIsConnecting(true);
      console.log("Connecting to WebSocket...");

      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log("WebSocket connected, joining room:", roomId);
        setIsConnecting(false);
        reconnectAttempts.current = 0;
        ws.current?.send(JSON.stringify({ type: "join-room", roomId }));

        // Create RTCPeerConnection after successful WebSocket connection
        peerConnection.current = new RTCPeerConnection(config);

        peerConnection.current.onicecandidate = (event) => {
          if (event.candidate && ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(
              JSON.stringify({
                type: "webrtc",
                data: {
                  type: "ice-candidate",
                  from: roomId,
                  to: "all",
                  payload: event.candidate,
                },
              })
            );
          }
        };

        peerConnection.current.ontrack = (event) => {
          console.log("Received remote track");
          setRemoteStream(event.streams[0]);
          setIsConnected(true);
        };

        // Add local tracks to peer connection
        localStream.getTracks().forEach((track) => {
          peerConnection.current?.addTrack(track, localStream);
        });
      };

      ws.current.onclose = () => {
        console.log("WebSocket closed");
        setIsConnected(false);
        setIsConnecting(false);

        // Clear any existing reconnection timeout
        if (reconnectTimeout.current) {
          clearTimeout(reconnectTimeout.current);
        }

        // Attempt to reconnect with exponential backoff
        if (reconnectAttempts.current < 5) {
          const timeout = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 10000);
          reconnectAttempts.current++;

          toast({
            title: "Connection lost",
            description: `Attempting to reconnect in ${timeout/1000} seconds...`,
          });

          reconnectTimeout.current = setTimeout(connect, timeout);
        } else {
          toast({
            title: "Connection failed",
            description: "Could not establish connection after multiple attempts. Please try again later.",
            variant: "destructive",
          });
        }
      };

      ws.current.onmessage = async (event) => {
        try {
          const message: WebRTCMessage = JSON.parse(event.data);

          switch (message.type) {
            case "offer":
              console.log("Received offer");
              await peerConnection.current?.setRemoteDescription(message.payload);
              const answer = await peerConnection.current?.createAnswer();
              await peerConnection.current?.setLocalDescription(answer);
              ws.current?.send(
                JSON.stringify({
                  type: "webrtc",
                  data: {
                    type: "answer",
                    from: roomId,
                    to: message.from,
                    payload: answer,
                  },
                })
              );
              break;

            case "answer":
              console.log("Received answer");
              await peerConnection.current?.setRemoteDescription(message.payload);
              break;

            case "ice-candidate":
              console.log("Received ICE candidate");
              if (peerConnection.current?.remoteDescription) {
                await peerConnection.current.addIceCandidate(message.payload);
              }
              break;
          }
        } catch (error) {
          console.error("WebRTC message handling error:", error);
        }
      };
    }

    connect();

    return () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      if (ws.current) {
        ws.current.close();
      }
      if (peerConnection.current) {
        peerConnection.current.close();
      }
    };
  }, [roomId, localStream]); // Only connect WebSocket after we have local stream

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