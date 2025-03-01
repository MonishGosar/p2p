import { Button } from "@/components/ui/button";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Phone,
  Copy,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ControlBarProps {
  isMuted: boolean;
  isVideoEnabled: boolean;
  toggleMute: () => void;
  toggleVideo: () => void;
  onLeave: () => void;
  roomId: string;
}

export function ControlBar({
  isMuted,
  isVideoEnabled,
  toggleMute,
  toggleVideo,
  onLeave,
  roomId,
}: ControlBarProps) {
  const { toast } = useToast();

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    toast({
      title: "Room ID copied",
      description: "Share this with someone to join the call",
    });
  };

  return (
    <div className="h-20 bg-white border-t flex items-center justify-center gap-4">
      <Button
        variant="outline"
        size="icon"
        onClick={toggleMute}
        className={isMuted ? "bg-red-50 text-red-600" : ""}
      >
        {isMuted ? <MicOff /> : <Mic />}
      </Button>
      
      <Button
        variant="outline"
        size="icon"
        onClick={toggleVideo}
        className={!isVideoEnabled ? "bg-red-50 text-red-600" : ""}
      >
        {isVideoEnabled ? <Video /> : <VideoOff />}
      </Button>

      <Button variant="destructive" size="icon" onClick={onLeave}>
        <Phone className="rotate-225" />
      </Button>

      <Button variant="outline" size="icon" onClick={copyRoomId}>
        <Copy />
      </Button>
    </div>
  );
}
