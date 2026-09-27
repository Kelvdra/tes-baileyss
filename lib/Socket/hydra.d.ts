import { proto } from "../../WAProto/index.js";

declare class hydra {
    private utils;
    private relayMessage;
    private waUploadToServer;
    private config;
    private sock;
    constructor(utils: any, waUploadToServer: any, relayMessageFn: any, config?: any, sock?: any);
    detectType(content: any): string | null;
    handleCarousel(content: any, jid: string, quoted: any): Promise<any>;
    handleStickerPack(stickerPack: any, jid: string, quoted: any): Promise<any>;
    handlePayment(content: any, quoted: any): Promise<{
        requestPaymentMessage: proto.Message.RequestPaymentMessage;
    }>;
    handleProduct(content: any, jid: string, quoted: any): Promise<any>;
    handleInteractive(content: any, jid: string, quoted: any): Promise<any>;
    /** Ported from dugong.js: handles the separate `interactiveButtons` content shape. */
    handleInteractiveButtons(content: any, jid: string, quoted: any): Promise<any>;
    handleAlbum(content: any, jid: string, quoted: any): Promise<any>;
    handleEvent(content: any, jid: string, quoted: any): Promise<any>;
    handlePollResult(content: any, jid: string, quoted: any): Promise<any>;
    handleStMention(content: any, jid: string, quoted: any): Promise<any>;
    handleOrderMessage(content: any, jid: string, quoted: any): Promise<any>;
    handleGroupStory(content: any, jid: string, quoted: any): Promise<any>;
    /** Shorthand handler for `sock.sendMessage(jid, { aiRich: { ... } })`, builds an AIRich instance under the hood. */
    handleAIRich(content: any, jid: string, quoted: any): Promise<any>;
    /** Ported from dugong.js: sends a WhatsApp Status update, optionally notifying specific jids/groups via mention. */
    sendStatusWhatsApp(content: any, jids?: string[]): Promise<any>;
}
export default hydra;
