import type { WAMediaUpload, AnyMessageContent, MiscMessageGenerationOptions, WAProto } from '../Types/index.js';
export type MmgInput = WAMediaUpload | string | {
    url?: string | URL;
    directPath?: string;
} | WAProto.IWebMessageInfo | Record<string, any>;
export type MmgImageUrls = {
    imagePreviewUrl: string;
    imageHighResUrl: string;
    sourceUrl: string;
};
export type MmgConfig = {
    cacheTtl?: number;
    cacheMax?: number;
};
export type ImageHdConfig = {
    /** lebar thumbnail inline dalam px (default 256) */
    thumbWidth?: number;
    /** kualitas JPEG thumbnail 1-100 (default 75) */
    thumbQuality?: number;
};
export type MmgMethods = {
    toMmgUrl: (input: MmgInput) => string | undefined;
    getMmgUrl: (input: MmgInput, options?: {
        mediaType?: 'image' | 'video' | 'audio' | 'document' | 'sticker';
        force?: boolean;
    }) => Promise<string>;
    getMmgImageUrls: {
        (input: MmgInput, options?: {
            force?: boolean;
        }): Promise<MmgImageUrls>;
        (input: MmgInput[], options?: {
            force?: boolean;
        }): Promise<MmgImageUrls[]>;
    };
    clearMmgCache: () => void;
};
export type SendImageHd = (jid: string, image: WAMediaUpload | string, content?: string | (Omit<Record<string, any>, 'image'> & ImageHdConfig & {
    caption?: string;
    mimetype?: string;
}), options?: MiscMessageGenerationOptions) => Promise<WAProto.WebMessageInfo | undefined>;
export declare const toMmgUrl: (input: MmgInput) => string | undefined;
export declare const readMediaInput: (input: any, httpOptions?: any) => Promise<Buffer>;
export declare const makeMmg: (options?: {
    waUploadToServer?: (...args: any[]) => Promise<any>;
    logger?: any;
    config?: MmgConfig;
}) => MmgMethods;
export declare const makeSendImageHd: (sock: {
    sendMessage: (...args: any[]) => Promise<any>;
    logger?: any;
}, config?: ImageHdConfig) => SendImageHd;
