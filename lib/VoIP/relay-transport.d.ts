/**
 * VoIP calling stack for @kelvdra/baileys.
 *
 * Derives from ShellTear's `baileys-caller`, which first showed that the WhatsApp Web
 * VoIP WASM engine can be driven from Node. Video calls, screen share, playlists
 */
export declare class RelayRtcTransport {
    send(data: Uint8Array, ip: string, port: number): void;
    closeAll(): void;
}
export default RelayRtcTransport;
