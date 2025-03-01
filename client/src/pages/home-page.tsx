import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { VideoGrid } from "@/components/video-call/video-grid";
import { ControlBar } from "@/components/video-call/control-bar";
import { useWebRTC } from "@/hooks/use-webrtc";
import { nanoid } from "nanoid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Waves } from "lucide-react";

export default function HomePage() {
  const [roomId, setRoomId] = useState("");
  const [isInCall, setIsInCall] = useState(false);
  const webrtc = useWebRTC(roomId);

  const handleJoinRoom = (event: React.FormEvent) => {
    event.preventDefault();
    if (roomId) {
      setIsInCall(true);
    }
  };

  const handleCreateRoom = () => {
    const newRoomId = nanoid(10);
    setRoomId(newRoomId);
    setIsInCall(true);
  };

  if (isInCall) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        <VideoGrid
          localStream={webrtc.localStream}
          remoteStream={webrtc.remoteStream}
          isConnected={webrtc.isConnected}
        />
        <ControlBar
          isMuted={webrtc.isMuted}
          isVideoEnabled={webrtc.isVideoEnabled}
          toggleMute={webrtc.toggleMute}
          toggleVideo={webrtc.toggleVideo}
          onLeave={() => setIsInCall(false)}
          roomId={roomId}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Waves className="h-6 w-6 text-primary animate-pulse" />
            <span>Peer</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleJoinRoom} className="space-y-4">
            <Input
              placeholder="Enter Room ID"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
            />
            <div className="flex gap-2">
              <Button type="submit" className="flex-1">
                Join Room
              </Button>
              <Button type="button" onClick={handleCreateRoom} className="flex-1">
                Create Room
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}