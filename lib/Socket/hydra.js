import {
  delay,
  generateMessageID,
  generateWAMessage,
  generateWAMessageContent,
  generateWAMessageFromContent,
  getUrlFromDirectPath,
  normalizeMessageContent,
  prepareWAMessageMedia,
} from "../Utils/index.js";
import { jidNormalizedUser, isJidGroup, isPnUser, STORIES_JID } from "../WABinary/index.js";
import WaProto from "../../WAProto/index.js";
import axios from "axios";
import crypto from "crypto";
import { AIRich } from "../MessageBuilder/index.js";
import { exec } from "child_process";
import { promises as fsp } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const WAProto = WaProto.proto;


class hydra {
    constructor(utils, waUploadToServer, relayMessageFn, config, sock) {
        this.utils = utils;
        this.relayMessage = relayMessageFn;
        this.waUploadToServer = waUploadToServer;
        this.config = config;
        this.sock = sock;
    }

    detectType(content) {
        if (content.requestPaymentMessage) return "PAYMENT";
        if (content.productMessage) return "PRODUCT";
        if (content.interactiveButtons) return "INTERACTIVE_BUTTONS";
        if (content.interactiveMessage) return "INTERACTIVE";
        if (content.albumMessage) return "ALBUM";
        if (content.eventMessage) return "EVENT";
        if (content.pollResultMessage) return "POLL_RESULT";
        if (content.statusMentionMessage) return "STATUS_MENTION";
        if (content.orderMessage) return "ORDER";
        if (content.groupStatus) return "GROUP_STATUS";
        if (content.carouselMessage || content.carousel) return "CAROUSEL"; 
        if (content.stickerPack) return "STICKER_PACK";
        if (content.aiRich || content.AIRich) return "AIRICH";
        if (content.video && content.motion === true) return "MOTION";
        return null;
}
    
    async handleCarousel(content, jid, quoted) {
    // 🔥 Support carouselMessage (native) & carousel (wrapper)
    const root = content.carouselMessage || content.carousel || {};
    const { caption = "", footer = "", cards = [] } = root;

    const carouselCards = await Promise.all(
        cards.map(async (card) => {
            if (card.productTitle) {
                // Mode Product
                return {
                    header: WAProto.Message.InteractiveMessage.Header.create({
                        title: card.headerTitle || "",
                        subtitle: card.headerSubtitle || "",
                        productMessage: {
                            product: {
                                productImage: (
                                    await this.utils.prepareWAMessageMedia(
                                        { image: { url: card.imageUrl } },
                                        { upload: this.waUploadToServer }
                                    )
                                ).imageMessage,
                                productId: card.productId || "123456",
                                title: card.productTitle,
                                description: card.productDescription || "",
                                currencyCode: card.currencyCode || "IDR",
                                priceAmount1000: card.priceAmount1000 || "100000",
                                retailerId: card.retailerId || "Retailer",
                                url: card.url || "",
                                productImageCount: 1
                            },
                            businessOwnerJid: card.businessOwnerJid || "0@s.whatsapp.net"
                        },
                        hasMediaAttachment: false
                    }),
                    body: WAProto.Message.InteractiveMessage.Body.create({
                        text: card.bodyText || ""
                    }),
                    footer: WAProto.Message.InteractiveMessage.Footer.create({
                        text: card.footerText || ""
                    }),
                    nativeFlowMessage: WAProto.Message.InteractiveMessage.NativeFlowMessage.create({
                        buttons: (card.buttons || []).map((btn) => ({
                            name: btn.name,
                            buttonParamsJson: JSON.stringify(btn.params || {})
                        }))
                    })
                };
            } else {
                // Mode Image biasa
                return {
                    header: WAProto.Message.InteractiveMessage.Header.create({
                        title: card.headerTitle || "",
                        subtitle: card.headerSubtitle || "",
                        hasMediaAttachment: !!card.imageUrl,
                        ...(card.imageUrl
                            ? await this.utils.prepareWAMessageMedia(
                                  { image: { url: card.imageUrl } },
                                  { upload: this.waUploadToServer }
                              )
                            : {}
                        )
                    }),
                    body: WAProto.Message.InteractiveMessage.Body.create({
                        text: card.bodyText || ""
                    }),
                    footer: WAProto.Message.InteractiveMessage.Footer.create({
                        text: card.footerText || ""
                    }),
                    nativeFlowMessage: WAProto.Message.InteractiveMessage.NativeFlowMessage.create({
                        buttons: (card.buttons || []).map((btn) => ({
                            name: btn.name,
                            buttonParamsJson: JSON.stringify(btn.params || {})
                        }))
                    })
                };
            }
        })
    );

    const msg = await this.utils.generateWAMessageFromContent(
        jid,
        {
            viewOnceMessage: {
                message: {
                    interactiveMessage: WAProto.Message.InteractiveMessage.create({
                        body: WAProto.Message.InteractiveMessage.Body.create({ text: caption }),
                        footer: WAProto.Message.InteractiveMessage.Footer.create({ text: footer }),
                        carouselMessage: WAProto.Message.InteractiveMessage.CarouselMessage.create({
                            cards: carouselCards,
                            messageVersion: 1
                        })
                    })
                }
            }
        },
        { quoted }
    );

    await this.relayMessage(jid, msg.message, { messageId: msg.key.id });
    return msg;
}

    async handleStickerPack(stickerPack, jid, quoted) {
        const result = await this.utils.prepareStickerPackMessage(stickerPack, {
            logger: this.utils?.logger,
            upload: this.waUploadToServer,
            options: this.utils?.options || {},
            mediaUploadTimeoutMs: this.utils?.mediaUploadTimeoutMs
        });

        if (result.isBatched) {
            let lastMsg;
            for (let i = 0; i < result.stickerPackMessage.length; i++) {
                const msg = await this.utils.generateWAMessageFromContent(
                    jid,
                    { stickerPackMessage: result.stickerPackMessage[i] },
                    { quoted, upload: this.waUploadToServer }
                );

                await this.relayMessage(jid, msg.message, {
                    messageId: msg.key.id
                });

                lastMsg = msg;

                if (i < result.stickerPackMessage.length - 1) {
                    await new Promise(r => setTimeout(r, 2000));
                }
            }
            return lastMsg;
        }

        const msg = await this.utils.generateWAMessageFromContent(
            jid,
            { stickerPackMessage: result.stickerPackMessage },
            { quoted, upload: this.waUploadToServer }
        );

        await this.relayMessage(jid, msg.message, {
            messageId: msg.key.id
        });

        return msg;
    }

    async handlePayment(content, quoted) {
        const data = content.requestPaymentMessage;
        let notes = {};

        if (data.sticker?.stickerMessage) {
            notes = {
                stickerMessage: {
                    ...data.sticker.stickerMessage,
                    contextInfo: {
                        stanzaId: quoted?.key?.id,
                        participant: quoted?.key?.participant || content.sender,
                        quotedMessage: quoted?.message
                    }
                }
            };
        } else if (data.note) {
            notes = {
                extendedTextMessage: {
                    text: data.note,
                    contextInfo: {
                        stanzaId: quoted?.key?.id,
                        participant: quoted?.key?.participant || content.sender,
                        quotedMessage: quoted?.message
                    }
                }
            };
        }

        return {
            requestPaymentMessage: WAProto.Message.RequestPaymentMessage.fromObject({
                expiryTimestamp: data.expiry || 0,
                amount1000: data.amount || 0,
                currencyCodeIso4217: data.currency || "IDR",
                requestFrom: data.from || "0@s.whatsapp.net",
                noteMessage: notes,
                background: data.background ?? {
                    id: "DEFAULT",
                    placeholderArgb: 0xFFF0F0F0
                }
            })
        };
    }
        
        async handleProduct(content, jid, quoted) {
            const {
                title, 
                description, 
                thumbnail,
                productId, 
                retailerId, 
                url, 
                body = "", 
                footer = "", 
                buttons = [],
                priceAmount1000 = null,
                currencyCode = "IDR"
            } = content.productMessage;
    
            let productImage;
    
            if (Buffer.isBuffer(thumbnail)) {
                const { imageMessage } = await this.utils.generateWAMessageContent(
                    { image: thumbnail }, 
                    { upload: this.waUploadToServer }
                );
                productImage = imageMessage;
            } else if (typeof thumbnail === "object" && thumbnail.url) {
                const { imageMessage } = await this.utils.generateWAMessageContent(
                    { image: { url: thumbnail.url }}, 
                    { upload: this.waUploadToServer }
                );
                productImage = imageMessage;
            }
    
            return {
                viewOnceMessage: {
                    message: {
                        interactiveMessage: {
                            body: { text: body },
                            footer: { text: footer },
                            header: {
                                title,
                                hasMediaAttachment: true,
                                productMessage: {
                                    product: {
                                        productImage,
                                        productId,
                                        title,
                                        description,
                                        currencyCode,
                                        priceAmount1000,
                                        retailerId,
                                        url,
                                        productImageCount: 1
                                    },
                                    businessOwnerJid: "0@s.whatsapp.net"
                                }
                            },
                            nativeFlowMessage: { buttons }
                        }
                    }
                }
            };
        }
        
        async handleInteractive(content, jid, quoted) {
            const {
                title,
                footer,
                thumbnail,
                image,
                video,
                document,
                mimetype,
                fileName,
                jpegThumbnail,
                contextInfo,
                externalAdReply,
                buttons = [],
                nativeFlowMessage,
                header
            } = content.interactiveMessage;
            
            let media = null;
            let mediaType = null;
            
            if (thumbnail) {
                media = await this.utils.prepareWAMessageMedia(
                    { image: { url: thumbnail } },
                    { upload: this.waUploadToServer }
                );
                mediaType = "image";
            } else if (image) {
                if (typeof image === "object" && image.url) {
                    media = await this.utils.prepareWAMessageMedia(
                        { image: { url: image.url } },
                        { upload: this.waUploadToServer }
                    );
                } else {
                    media = await this.utils.prepareWAMessageMedia(
                        { image: image },
                        { upload: this.waUploadToServer }
                    );
                }
                mediaType = "image";
            } else if (video) {
                if (typeof video === "object" && video.url) {
                    media = await this.utils.prepareWAMessageMedia(
                        { video: { url: video.url } },
                        { upload: this.waUploadToServer }
                    );
                } else {
                    media = await this.utils.prepareWAMessageMedia(
                        { video: video },
                        { upload: this.waUploadToServer }
                    );
                }
                mediaType = "video";
            } else if (document) {
                let documentPayload = { document: document };
                
                if (jpegThumbnail) {
                    if (typeof jpegThumbnail === "object" && jpegThumbnail.url) {
                        documentPayload.jpegThumbnail = { url: jpegThumbnail.url };
                    } else {
                        documentPayload.jpegThumbnail = jpegThumbnail;
                    }
                }
        
                media = await this.utils.prepareWAMessageMedia(
                    documentPayload,
                    { upload: this.waUploadToServer }
                );
        
                if (fileName) {
                    media.documentMessage.fileName = fileName;
                }
                if (mimetype) {
                    media.documentMessage.mimetype = mimetype;
                }
                mediaType = "document";
            }
            
            let interactiveMessage = {
                body: { text: title || "" },
                footer: { text: footer || "" }
            };
            
            if (buttons && buttons.length > 0) {
                interactiveMessage.nativeFlowMessage = {
                    buttons: buttons
                };
       
                if (nativeFlowMessage) {
                    interactiveMessage.nativeFlowMessage = {
                        ...interactiveMessage.nativeFlowMessage,
                        ...nativeFlowMessage
                    };
                }
            } else if (nativeFlowMessage) {
                interactiveMessage.nativeFlowMessage = nativeFlowMessage;
            }
            
            if (media) {
                interactiveMessage.header = {
                    title: header || "",
                    hasMediaAttachment: true,
                    ...media
                };
            } else {
                interactiveMessage.header = {
                    title: header || "",
                    hasMediaAttachment: false
                };
            }

            let finalContextInfo = {};
            
            if (contextInfo) {
                finalContextInfo = {
                    mentionedJid: contextInfo.mentionedJid || [],
                    forwardingScore: contextInfo.forwardingScore || 0,
                    isForwarded: contextInfo.isForwarded || false,
                    ...contextInfo
                };
            }

            if (externalAdReply) {
                finalContextInfo.externalAdReply = {
                    title: externalAdReply.title || "",
                    body: externalAdReply.body || "",
                    mediaType: externalAdReply.mediaType || 1,
                    thumbnailUrl: externalAdReply.thumbnailUrl || "",
                    mediaUrl: externalAdReply.mediaUrl || "",
                    sourceUrl: externalAdReply.sourceUrl || "",
                    showAdAttribution: externalAdReply.showAdAttribution || false,
                    renderLargerThumbnail: externalAdReply.renderLargerThumbnail || false,
                    ...externalAdReply
                };
            }
            
            if (Object.keys(finalContextInfo).length > 0) {
                interactiveMessage.contextInfo = finalContextInfo;
            }

            return {
                interactiveMessage: interactiveMessage
            };
        }

        // Ported from dugong.js: handles the separate `interactiveButtons` content shape
        // (as opposed to `interactiveMessage`), which hydra.js had no equivalent for.
        async handleInteractiveButtons(content, jid, quoted) {
            const {
                text,
                caption,
                title,
                subtitle,
                footer,
                interactiveButtons,
                hasMediaAttachment,
                image,
                video,
                document,
                mimetype,
                jpegThumbnail,
                location,
                product,
                businessOwnerJid
            } = content;

            const bodyText = text || caption || "";
            const buttons = (interactiveButtons || []).map((btn) => ({
                name: btn.name,
                buttonParamsJson: typeof btn.buttonParamsJson === "string"
                    ? btn.buttonParamsJson
                    : JSON.stringify(btn.buttonParamsJson)
            }));

            let headerContent = {};
            let mediaAttached = typeof hasMediaAttachment === "boolean" ? hasMediaAttachment : false;

            if (image) {
                const src = typeof image === "object" && image.url ? { image: { url: image.url } } : { image };
                const uploaded = await this.utils.prepareWAMessageMedia(src, { upload: this.waUploadToServer });
                headerContent = { ...uploaded };
                mediaAttached = typeof hasMediaAttachment === "boolean" ? hasMediaAttachment : true;
            } else if (video) {
                const src = typeof video === "object" && video.url ? { video: { url: video.url } } : { video };
                const uploaded = await this.utils.prepareWAMessageMedia(src, { upload: this.waUploadToServer });
                headerContent = { ...uploaded };
                mediaAttached = typeof hasMediaAttachment === "boolean" ? hasMediaAttachment : true;
            } else if (document) {
                const docPayload = typeof document === "object" && document.url ? { document: { url: document.url } } : { document };
                if (mimetype) docPayload.mimetype = mimetype;
                const uploaded = await this.utils.prepareWAMessageMedia(docPayload, { upload: this.waUploadToServer });
                if (jpegThumbnail) {
                    uploaded.documentMessage.jpegThumbnail = typeof jpegThumbnail === "string"
                        ? Buffer.from(jpegThumbnail, "base64")
                        : jpegThumbnail;
                }
                headerContent = { ...uploaded };
                mediaAttached = typeof hasMediaAttachment === "boolean" ? hasMediaAttachment : true;
            } else if (location) {
                headerContent = {
                    locationMessage: {
                        degreesLatitude: location.degressLatitude || location.degreesLatitude || 0,
                        degreesLongitude: location.degressLongitude || location.degreesLongitude || 0,
                        name: location.name || ""
                    }
                };
                mediaAttached = typeof hasMediaAttachment === "boolean" ? hasMediaAttachment : true;
            } else if (product) {
                let productImage;
                if (product.productImage) {
                    const imgSrc = typeof product.productImage === "object" && product.productImage.url
                        ? { image: { url: product.productImage.url } }
                        : { image: product.productImage };
                    const uploaded = await this.utils.prepareWAMessageMedia(imgSrc, { upload: this.waUploadToServer });
                    productImage = uploaded.imageMessage;
                }
                headerContent = {
                    productMessage: {
                        product: {
                            productImage,
                            productId: product.productId,
                            title: product.title,
                            description: product.description,
                            currencyCode: product.currencyCode || "IDR",
                            priceAmount1000: product.priceAmount1000,
                            retailerId: product.retailerId,
                            url: product.url,
                            productImageCount: product.productImageCount || 1
                        },
                        businessOwnerJid: businessOwnerJid || "0@s.whatsapp.net"
                    }
                };
                mediaAttached = typeof hasMediaAttachment === "boolean" ? hasMediaAttachment : true;
            }

            const interactiveMessage = {
                body: { text: bodyText },
                footer: { text: footer || "" },
                header: {
                    title: title || "",
                    subtitle: subtitle || "",
                    hasMediaAttachment: mediaAttached,
                    ...headerContent
                },
                nativeFlowMessage: { buttons }
            };

            return {
                viewOnceMessage: {
                    message: {
                        messageContextInfo: {
                            deviceListMetadata: {},
                            deviceListMetadataVersion: 2,
                            messageSecret: crypto.randomBytes(32)
                        },
                        interactiveMessage
                    }
                }
            };
        }
        
        async handleAlbum(content, jid, quoted) {
            const array = content.albumMessage || content.album;
            const ctxInfo = content.contextInfo || {};
            const selfJid = jidNormalizedUser(this.sock?.authState?.creds?.me?.id || "");
            const album = await this.utils.generateWAMessageFromContent(jid, {
                messageContextInfo: {
                    messageSecret: crypto.randomBytes(32),
                },
                albumMessage: {
                    expectedImageCount: array.filter((a) => a.hasOwnProperty("image")).length,
                    expectedVideoCount: array.filter((a) => a.hasOwnProperty("video")).length,
                },
            }, {
                userJid: selfJid,
                quoted,
                upload: this.waUploadToServer
            });
            
            await this.relayMessage(jid, album.message, {
                messageId: album.key.id,
            });
            
            for (let item of array) {
                if (ctxInfo && Object.keys(ctxInfo).length > 0 && !item.contextInfo) {
                    item = { ...item, contextInfo: ctxInfo };
                }
                const img = await this.utils.generateWAMessage(jid, item, {
                    upload: this.waUploadToServer,
                });
                
                img.message.messageContextInfo = {
                    messageSecret: crypto.randomBytes(32),
                    messageAssociation: {
                        associationType: 1,
                        parentMessageKey: album.key,
                    },    
                    participant: "0@s.whatsapp.net",
                    remoteJid: "status@broadcast",
                    forwardingScore: 99999,
                    isForwarded: true,
                    mentionedJid: [jid],
                    starred: true,
                    labels: ["Y", "Important"],
                    isHighlighted: true,
                    businessMessageForwardInfo: {
                        businessOwnerJid: jid,
                    },
                    dataSharingContext: {
                        showMmDisclosure: true,
                    },
                };

                img.message.forwardedNewsletterMessageInfo = {
                    newsletterJid: "0@newsletter",
                    serverMessageId: 1,
                    newsletterName: `WhatsApp`,
                    contentType: 1,
                    timestamp: new Date().toISOString(),
                    senderName: "7-Yuukey",
                    contentType: "UPDATE_CARD",
                    priority: "high",
                    status: "sent",
                };
                
                img.message.disappearingMode = {
                    initiator: 3,
                    trigger: 4,
                    initiatorDeviceJid: jid,
                    initiatedByExternalService: true,
                    initiatedByUserDevice: true,
                    initiatedBySystem: true,      
                    initiatedByServer: true,
                    initiatedByAdmin: true,
                    initiatedByUser: true,
                    initiatedByApp: true,
                    initiatedByBot: true,
                    initiatedByMe: true,
                };

                await this.relayMessage(jid, img.message, {
                    messageId: img.key.id,
                    quoted: {
                        key: {
                            remoteJid: album.key.remoteJid,
                            id: album.key.id,
                            fromMe: true,
                            participant: selfJid,
                        },
                        message: album.message,
                    },
                });
            }
            return album;
        }   

        /**
         * Extracts a single JPEG frame from a remote video URL using ffmpeg
         * (ffmpeg can read directly from an http/https input, no download step needed).
         * Returns a Buffer, or throws if ffmpeg fails / isn't installed.
         */
        async _extractVideoFrame(url, { time = "00:00:01", width = 720 } = {}) {
            const outPath = join(tmpdir(), `motion-${crypto.randomUUID()}.jpg`);
            await new Promise((resolve, reject) => {
                const cmd = `ffmpeg -ss ${time} -i "${url}" -y -vf "scale=${width}:-2" -vframes 1 -f image2 "${outPath}"`;
                exec(cmd, (err) => (err ? reject(err) : resolve()));
            });
            try {
                return await fsp.readFile(outPath);
            } finally {
                fsp.unlink(outPath).catch(() => {});
            }
        }

        /**
         * "Motion photo": sendMessage(jid, { video: { url }, motion: true, caption })
         * Sends a photo (auto-grabbed as a thumbnail frame from the video itself) as the
         * parent message, then the real video as a child message linked to it via
         * messageAssociation.associationType = MOTION_PHOTO (12). Supported WhatsApp
         * clients render this as a photo that can be played like a short video.
         *
         * If a thumbnail frame can't be extracted (bad url, ffmpeg missing, etc.) this
         * falls back to sending the video normally so `motion: true` never blocks the send.
         */
        async handleMotion(content, jid, quoted) {
            const { video, motion, caption, ...rest } = content;
            const selfJid = jidNormalizedUser(this.sock?.authState?.creds?.me?.id || "");
            const videoUrl = video && typeof video === "object" ? video.url : video;

            let thumbBuffer;
            if (typeof videoUrl === "string" && /^https?:\/\//i.test(videoUrl)) {
                try {
                    thumbBuffer = await this._extractVideoFrame(videoUrl);
                } catch {
                    thumbBuffer = undefined;
                }
            }

            if (!thumbBuffer) {
                // couldn't get a frame for the parent photo — just send the video as usual
                const fallback = await this.utils.generateWAMessage(jid, { video, caption, ...rest }, {
                    userJid: selfJid,
                    quoted,
                    upload: this.waUploadToServer,
                });
                await this.relayMessage(jid, fallback.message, { messageId: fallback.key.id });
                return fallback;
            }

            const parent = await this.utils.generateWAMessage(jid, { image: thumbBuffer, caption }, {
                userJid: selfJid,
                quoted,
                upload: this.waUploadToServer,
            });
            await this.relayMessage(jid, parent.message, { messageId: parent.key.id });

            const child = await this.utils.generateWAMessage(jid, { video, ...rest }, {
                userJid: selfJid,
                upload: this.waUploadToServer,
            });
            child.message.messageContextInfo = {
                ...(child.message.messageContextInfo || {}),
                messageAssociation: {
                    associationType: 12, // MOTION_PHOTO
                    parentMessageKey: parent.key,
                },
            };
            await this.relayMessage(jid, child.message, { messageId: child.key.id });

            return parent;
        }

        async handleEvent(content, jid, quoted) {
            const eventData = content.eventMessage;
            
            const msg = await this.utils.generateWAMessageFromContent(jid, {
                viewOnceMessage: {
                    message: {
                        messageContextInfo: {
                            deviceListMetadata: {},
                            deviceListMetadataVersion: 2,
                            messageSecret: crypto.randomBytes(32),
                            supportPayload: JSON.stringify({
                                version: 2,
                                is_ai_message: true,
                                should_show_system_message: true,
                                ticket_id: crypto.randomBytes(16).toString("hex")
                            })
                        },
                        eventMessage: {
                            contextInfo: {
                                mentionedJid: [jid],
                                participant: jid,
                                remoteJid: "status@broadcast",
                                forwardedNewsletterMessageInfo: {
                                    newsletterName: "D | 7eppeli-Exloration",
                                    newsletterJid: "120363421563597486@newsletter",
                                    serverMessageId: 1
                                }
                            },
                            isCanceled: eventData.isCanceled || false,
                            name: eventData.name,
                            description: eventData.description,
                            location: eventData.location || {
                                degreesLatitude: 0,
                                degreesLongitude: 0,
                                name: "Location"
                            },
                            joinLink: eventData.joinLink || "",
                            startTime: typeof eventData.startTime === "string" ? parseInt(eventData.startTime) : eventData.startTime || Date.now(),
                            endTime: typeof eventData.endTime === "string" ? parseInt(eventData.endTime) : eventData.endTime || Date.now() + 3600000,
                            extraGuestsAllowed: eventData.extraGuestsAllowed !== false
                        }
                    }
                }
            }, { quoted, userJid: jidNormalizedUser(this.sock?.authState?.creds?.me?.id || "") });
            
            await this.relayMessage(jid, msg.message, {
                messageId: msg.key.id
            });
            return msg;
        }
        
        async handlePollResult(content, jid, quoted) {
            const pollData = content.pollResultMessage;
            const msg = await this.utils.generateWAMessageFromContent(jid, {
                pollResultSnapshotMessage: {
                    name: pollData.name,
                    pollVotes: pollData.pollVotes.map(vote => ({
                        optionName: vote.optionName,
                        optionVoteCount: typeof vote.optionVoteCount === "number" 
                        ? vote.optionVoteCount.toString() 
                        : vote.optionVoteCount
                    })),
                    contextInfo: {
                        isForwarded: true,
                        forwardingScore: 1,
                        forwardedNewsletterMessageInfo: {
                            newsletterName: pollData.newsletter?.newsletterName || "120363399602691477@newsletter",
                            newsletterJid: pollData.newsletter?.newsletterJid || "Newsletter",
                            serverMessageId: 1000,
                            contentType: "UPDATE"
                        }
                    }
                }
            }, {
                userJid: jidNormalizedUser(this.sock?.authState?.creds?.me?.id || ""),
                quoted
            });
        
            await this.relayMessage(jid, msg.message, {
                messageId: msg.key.id
            });
       
            return msg;
        }

        async handleStMention(content, jid, quoted) {
            const data = content.statusMentionMessage;
            const mediaType = null;
            
            if (data.image) {
                if (typeof data.image === "object" && data.image.url) {
                    media = await this.utils.prepareWAMessageMedia(
                        { image: { url: data.image.url } },
                        { upload: this.waUploadToServer }
                    );
                } else {
                    media = await this.utils.prepareWAMessageMedia(
                        { image: data.image },
                        { upload: this.waUploadToServer }
                    );
                }
                mediaType = "image";
            } else if (data.video) {
                if (typeof data.video === "object" && data.video.url) {
                    media = await this.utils.prepareWAMessageMedia(
                        { video: { url: data.video.url } },
                        { upload: this.waUploadToServer }
                    );
                } else {
                    media = await this.utils.prepareWAMessageMedia(
                        { video: data.video },
                        { upload: this.waUploadToServer }
                    );
                }
                mediaType = "video";
            };
            let msg = await this.relayMessage("status@broadcast", {
                ...media }, {
                  statusJidList: [data.mentions, this.user.id], 
                  additionalNodes: [{
                      tag: "meta",
                      attrs: {},
                      content: [
                        {
                          tag: "mentioned_users",
                          attrs: {},
                          content: [
                            {
                              tag: "to",
                              attrs: { jid: target },
                              content: undefined,
                            }
                          ]
                       }
                    ],
                  }]
                });
            
            let xontols = await this.utils.generateWAMessageFromContent(jid, {
                statusMentionMessage: {
                    message: {
                        protocolMessage: {
                            messageId: msg.key,
                            type: "STATUS_MENTION_MESSAGE"
                        }
                    }
                }
            }, {
                addtionalNodes: [
                    {
                        tag: "meta",
                        attrs: { "is_status_mention": true },
                        content: undefined
                    }
                ]
            });

            await this.relayMessage(jid, xontols.message, {
                messageId: xontols.key.id
            })
            return xontols
        }
     
        async handleOrderMessage(content, jid, quoted) {
    const orderData = content.orderMessage;

    // === SUPPORT: BUFFER / URL ===
    let thumbnail = null;
    if (orderData.thumbnail) {
        if (Buffer.isBuffer(orderData.thumbnail)) {
            thumbnail = orderData.thumbnail;
        } else if (typeof orderData.thumbnail === "string") {
            try {
                const res = await axios.get(orderData.thumbnail, {
                    responseType: "arraybuffer"
                });
                thumbnail = Buffer.from(res.data);
            } catch (e) {
                console.error("Gagal download thumbnail:", e);
                thumbnail = null;
            }
        }
    }

    const Haha = await this.utils.generateWAMessageFromContent(jid, {
        orderMessage: {
            orderId: "7EPPELI25022008",
            thumbnail: thumbnail, // ← pakai hasil parsing dari atas
            itemCount: orderData.itemCount || 0,
            status: "ACCEPTED",
            surface: "CATALOG",
            message: orderData.message,
            orderTitle: orderData.orderTitle,
            sellerJid: "0@whatsapp.net",
            token: "7EPPELI_EXAMPLE_TOKEN",
            totalAmount1000: orderData.totalAmount1000 || 0,
            totalCurrencyCode: orderData.totalCurrencyCode || "IDR",
            messageVersion: 2
        }
    }, { quoted });

    await this.relayMessage(jid, Haha.message, {});
    return Haha;
}

        async handleGroupStory(content, jid, quoted) {
          const storyData = content.groupStatus;
            let messageContent;
        
            if (storyData.message) {
              messageContent = storyData;
            } else if (typeof this.utils?.prepareMessageContent === "function") {
              messageContent = await this.utils.prepareMessageContent(storyData, {
                  upload: this.waUploadToServer
              });
            } else {
              messageContent = await generateWAMessageContent(storyData, {
                upload: this.waUploadToServer
              });
            }

            const innerMsg = messageContent.message || messageContent;
            const msgKey = Object.keys(innerMsg).find(
                (k) => innerMsg[k] && typeof innerMsg[k] === "object"
            );
            if (msgKey) {
                innerMsg[msgKey].contextInfo = innerMsg[msgKey].contextInfo || {};
                innerMsg[msgKey].contextInfo.isGroupStatus = true;
                if (!innerMsg[msgKey].contextInfo.statusSourceType) {
                    if (innerMsg.imageMessage) innerMsg[msgKey].contextInfo.statusSourceType = 0;
                    else if (innerMsg.videoMessage) innerMsg[msgKey].contextInfo.statusSourceType = 1;
                    else if (innerMsg.audioMessage) innerMsg[msgKey].contextInfo.statusSourceType = 3;
                    else if (innerMsg.extendedTextMessage) innerMsg[msgKey].contextInfo.statusSourceType = 4;
                }
            }

            const msg = {
              message: {
                groupStatusMessageV2: {
                  message: innerMsg
                }
              }
            };

            return await this.relayMessage(jid, msg.message, {
              messageId: this.utils.generateMessageID()
            });
    }

    // Shorthand support for `sock.sendMessage(jid, { aiRich: { ... } })`.
    // Internally this just builds an AIRich instance (lib/MessageBuilder) from a
    // plain shorthand object and calls ai.send(), so it accepts the same field
    // names documented in airich_examples.md, just flattened into one object.
    // `ai.send()` already relays the message itself, so callers of this method
    // (see the AIRICH case in messages-send.js) should just return its result
    // instead of calling relayMessage again.
    async handleAIRich(content, jid, quoted) {
        const data = content.aiRich || content.AIRich || {};

        if (data instanceof AIRich) {
            return await data.send(jid, { quoted, ...(content.options || {}) });
        }

        // `this.sock` at this point in the socket bootstrap does not have
        // `.relayMessage` attached yet (it's only merged onto the final socket
        // object after this module returns), so AIRich.send() would fail with
        // "relayMessage is not a function". Give it a client object that has
        // the two things AIRich actually calls on #client: relayMessage and
        // waUploadToServer, both already available on `this` via the hydra
        // constructor args.
        const client = { ...this.sock, relayMessage: this.relayMessage, waUploadToServer: this.waUploadToServer };
        const ai = new AIRich(client);

        const toArray = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

        // Each entry: [shorthand key(s), builder call]. Order matters: it decides
        // the order sections appear in the message, same as calling ai.addX(...)
        // yourself line by line.
        const steps = [
            ['text', (v) => ai.addText(v)],
            ['code', (v) => toArray(v).forEach((c) => ai.addCode(c.language, c.content ?? c.code))],
            ['table', (v) => ai.addTable(v)],
            ['image', (v) => ai.addImage(v)],
            ['images', (v) => ai.addImage(v)],
            ['video', (v) => {
                // addVideo(videoUrl, options) takes TWO separate positional args,
                // so a shorthand value for `video` can be:
                //   - a plain string/buffer url                       -> addVideo(v)
                //   - a single object { url, autoFill, status, ... }  -> addVideo(v.url, v)
                //   - a [url, optionsObject] tuple                    -> addVideo(v[0], v[1])
                //   - an array of videos (strings/buffers/objects)    -> addVideo(v)
                if (typeof v === 'string' || Buffer.isBuffer(v)) {
                    return ai.addVideo(v);
                }
                if (Array.isArray(v)) {
                    const [first, second] = v;
                    const secondIsOptions = second && typeof second === 'object' && !Array.isArray(second) && !Buffer.isBuffer(second) && !second.url;
                    if (v.length === 2 && secondIsOptions) {
                        return ai.addVideo(first, second);
                    }
                    return ai.addVideo(v);
                }
                if (v && typeof v === 'object') {
                    return ai.addVideo(v.url ?? v, v);
                }
                return ai.addVideo(v);
            }],
            ['map', (v) => ai.addMap(v)],
            ['source', (v) => ai.addSource(v)],
            ['sources', (v) => ai.addSource(v)],
            ['product', (v) => ai.addProduct(v)],
            ['post', (v) => ai.addPost(v)],
            ['reels', (v) => ai.addReels(v)],
            ['metadata', (v) => ai.addMetadata(v)],
            ['tip', (v) => ai.addTip(v)],
            ['suggest', (v) => ai.addSuggest(v)],
            ['footerAction', (v) => ai.addFooterAction(v)],
            ['widget', (v) => ai.addWidget(v)],
        ];

        for (const [key, apply] of steps) {
            if (data[key] === undefined || data[key] === null) continue;
            apply(data[key]);
        }

        const {
            text, code, table, image, images, video, map, source, sources,
            product, post, reels, metadata, tip, suggest, footerAction, widget,
            ...sendOptions
        } = data;

        return await ai.send(jid, { quoted, ...sendOptions });
    }

    // Ported from dugong.js: sends a WhatsApp Status update, optionally notifying
    // specific jids/groups via mention. hydra.js had no equivalent for this at all.
    // Requires config/sock to have been passed into the constructor.
    async sendStatusWhatsApp(content, jids = []) {
        const userJid = jidNormalizedUser(this.sock.authState.creds.me.id);
        const allUsers = new Set();
        allUsers.add(userJid);

        for (const id of jids) {
            if (isJidGroup(id)) {
                try {
                    const metadata = await this.sock.groupMetadata(id);
                    metadata.participants.forEach((p) => allUsers.add(jidNormalizedUser(p.id)));
                } catch (error) {
                    this.config.logger.error(`Error getting metadata for group ${id}: ${error}`);
                }
            } else if (isPnUser(id)) {
                allUsers.add(jidNormalizedUser(id));
            }
        }

        const uniqueUsers = Array.from(allUsers);
        const getRandomHexColor = () => "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0");

        const isMedia = content.image || content.video || content.audio;
        const isAudio = !!content.audio;
        const messageContent = { ...content };

        if (isMedia && !isAudio) {
            if (messageContent.text) {
                messageContent.caption = messageContent.text;
                delete messageContent.text;
            }
            delete messageContent.ptt;
            delete messageContent.font;
            delete messageContent.backgroundColor;
            delete messageContent.textColor;
        }
        if (isAudio) {
            delete messageContent.text;
            delete messageContent.caption;
            delete messageContent.font;
            delete messageContent.textColor;
        }

        const font = !isMedia ? content.font || Math.floor(Math.random() * 9) : undefined;
        const textColor = !isMedia ? content.textColor || getRandomHexColor() : undefined;
        const backgroundColor = (!isMedia || isAudio) ? content.backgroundColor || getRandomHexColor() : undefined;
        const ptt = isAudio ? (typeof content.ptt === "boolean" ? content.ptt : true) : undefined;

        const { getUrlInfo } = await import("../Utils/link-preview.js");

        const msg = await this.utils.generateWAMessage(STORIES_JID, messageContent, {
            logger: this.config.logger,
            userJid,
            getUrlInfo: (text) => getUrlInfo(text, {
                thumbnailWidth: this.config.linkPreviewImageThumbnailWidth,
                fetchOpts: { timeout: 3000, ...(this.config.options || {}) },
                logger: this.config.logger,
                uploadImage: this.config.generateHighQualityLinkPreview ? this.waUploadToServer : undefined
            }),
            upload: this.waUploadToServer,
            mediaCache: this.config.mediaCache,
            options: this.config.options,
            font,
            textColor,
            backgroundColor,
            ptt
        });

        await this.relayMessage(STORIES_JID, msg.message, {
            messageId: msg.key.id,
            statusJidList: uniqueUsers,
            additionalNodes: [{
                tag: "meta",
                attrs: {},
                content: [{
                    tag: "mentioned_users",
                    attrs: {},
                    content: jids.map((jid) => ({
                        tag: "to",
                        attrs: { jid: jidNormalizedUser(jid) }
                    }))
                }]
            }]
        });

        for (const id of jids) {
            try {
                const normalizedId = jidNormalizedUser(id);
                const isPrivate = isPnUser(normalizedId);
                const type = isPrivate ? "statusMentionMessage" : "groupStatusMentionMessage";
                const protocolMessage = {
                    [type]: {
                        message: {
                            protocolMessage: {
                                key: msg.key,
                                type: 25
                            }
                        }
                    },
                    messageContextInfo: {
                        messageSecret: crypto.randomBytes(32)
                    }
                };
                const statusMsg = await this.utils.generateWAMessageFromContent(normalizedId, protocolMessage, {
                    userJid: jidNormalizedUser(this.sock?.authState?.creds?.me?.id || "")
                });
                await this.relayMessage(normalizedId, statusMsg.message, {
                    additionalNodes: [{
                        tag: "meta",
                        attrs: isPrivate ? { is_status_mention: "true" } : { is_group_status_mention: "true" }
                    }]
                });
                await this.utils.delay(2000);
            } catch (error) {
                this.config.logger.error(`Error sending to ${id}: ${error}`);
            }
        }

        return msg;
    }

    }

export default hydra
