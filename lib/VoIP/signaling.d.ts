/**
 * VoIP calling stack for @kelvdra/baileys.
 *
 * Derives from ShellTear's `baileys-caller`, which first showed that the WhatsApp Web
 * VoIP WASM engine can be driven from Node. Video calls, screen share, playlists,
 */
export declare class SignalingBridge {
    constructor(config: { sock: any; logger?: (...args: any[]) => void; debug?: boolean });
    setSocket(socket: any): void;
    resolveLid(jid: string): Promise<string | null>;
    discoverPeerDevices(jid: string): Promise<string[]>;
    attachEngine(engine: any): void;
    sendSignaling(peerJid: string, callId: string, xmlPayload: any): Promise<any>;
    processIncomingCall(node: any, engine: any, activeCallId: string): void;
    processIncomingReceipt(node: any, engine: any, activeCallId: string): void;
}
export default SignalingBridge;
