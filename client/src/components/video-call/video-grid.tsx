import { Loader2 } from "lucide-react";

interface VideoGridProps {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isConnected: boolean;
}

export function VideoGrid({ localStream, remoteStream, isConnected }: VideoGridProps) {
  return (
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
      <div className="relative aspect-video bg-slate-900 rounded-lg overflow-hidden">
        {localStream ? (
          <video
            autoPlay
            playsInline
            muted
            ref={(video) => {
              if (video && video.srcObject !== localStream) {
                video.srcObject = localStream;
              }
            }}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        )}
        <div className="absolute bottom-4 left-4 bg-black/50 text-white px-2 py-1 rounded text-sm">
          You
        </div>
      </div>

      <div className="relative aspect-video bg-slate-900 rounded-lg overflow-hidden">
        {remoteStream ? (
          <video
            autoPlay
            playsInline
            ref={(video) => {
              if (video && video.srcObject !== remoteStream) {
                video.srcObject = remoteStream;
              }
            }}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            {isConnected ? (
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            ) : (
              <p className="text-slate-400">Waiting for peer to join...</p>
            )}
          </div>
        )}
        <div className="absolute bottom-4 left-4 bg-black/50 text-white px-2 py-1 rounded text-sm">
          Peer
        </div>
      </div>
    </div>
  );
}
