/**
 * VoIP calling stack for @kelvdra/baileys.
 *
 * Derives from ShellTear's `baileys-caller`, which first showed that the WhatsApp Web
 * VoIP WASM engine can be driven from Node. Video calls, screen share, playlists,
 */
export declare const VIDEO_FORMAT_I420: number;
export declare class VideoFeeder {
    constructor(width: number, height: number, fps: number, onFrame: (frame: Buffer, width: number, height: number, fps: number) => void, source?: string | null, hooks?: {
        onTrackStart?: (track: string) => void;
        onTrackEnd?: (track: string) => void;
        onIdle?: () => void;
        ffmpegPath?: string;
    });
    readonly queuedFrames: number;
    readonly playlistLength: number;
    readonly currentTrack: string | null;
    readonly idle: boolean;
    underflowFrames: number;
    framesEmitted: number;
    tracksPlayed: number;
    rebuffers: number;
    ffmpegPath: string;
    enqueue(source: string | string[]): number;
    clearPlaylist(): void;
    skip(): boolean;
    start(playlist?: string[]): void;
    stop(): void;
}
export default VideoFeeder;
