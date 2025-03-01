import { useEffect, useRef, useState } from "react";
import { useToast } from "./use-toast";
import type { WebRTCMessage } from "@shared/schema";

const config = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302",
    },
  ],
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

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      ws.current?.send(JSON.stringify({ type: "join-room", roomId }));
    };

    ws.current.onmessage = async (event) => {
      const message: WebRTCMessage = JSON.parse(event.data);
      
      if (!peerConnection.current) {
        peerConnection.current = new RTCPeerConnection(config);
        
        peerConnection.current.onicecandidate = (event) => {
          if (event.candidate) {
            ws.current?.send(
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
          setRemoteStream(event.streams[0]);
          setIsConnected(true);
        };

        if (localStream) {
          localStream.getTracks().forEach((track) => {
            peerConnection.current?.addTrack(track, localStream);
          });
        }
      }

      switch (message.type) {
        case "offer":
          await peerConnection.current.setRemoteDescription(message.payload);
          const answer = await peerConnection.current.createAnswer();
          await peerConnection.current.setLocalDescription(answer);
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
          await peerConnection.current.setRemoteDescription(message.payload);
          break;

        case "ice-candidate":
          await peerConnection.current.addIceCandidate(message.payload);
          break;
      }
    };

    return () => {
      if (ws.current) {
        ws.current.close();
      }
      if (peerConnection.current) {
        peerConnection.current.close();
      }
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [roomId]);

  useEffect(() => {
    async function setupMedia() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        setLocalStream(stream);
      } catch (error) {
        toast({
          title: "Media Error",
          description: "Could not access camera or microphone",
          variant: "destructive",
        });
      }
    }
    setupMedia();
  }, []);

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
