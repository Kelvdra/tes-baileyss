import * as Utils_1 from '../Utils/index.js'
import WaProto from '../../WAProto/index.js'
const WAProto = WaProto.proto
import axios from "axios"
import crypto from 'crypto'

function hydraExtractHyperlink(text = '') {
    const hyperlink = [];
    const stack = [];
    let result = '';
    let last = 0;
    let index = 1;
    let entity = 0;

    for (let i = 0; i < text.length; i++) {
        if (text[i] === '[' && text[i - 1] !== '\\') {
            stack.push(i);
        } else if (text[i] === ']' && text[i + 1] === '(') {
            const start = stack.pop();
            if (start == null) continue;

            let end = i + 2;
            let depth = 1;

            while (end < text.length && depth) {
                if (text[end] === '(' && text[end - 1] !== '\\') depth++;
                else if (text[end] === ')' && text[end - 1] !== '\\') depth--;
                end++;
            }

            if (depth) continue;

            const txt = text.slice(start + 1, i).trim();
            const url = text.slice(i + 2, end - 1);
            const reference_id = txt ? 0 : index++;
            const key = `HYDRA_IE_${entity++}`;
            const tag = `{{${key}}}${txt || url || 'Link'}{{/${key}}}`;

            result += text.slice(last, start) + tag;
            last = end;

            hyperlink.push({ reference_id, key, text: txt, url });
            i = end - 1;
        }
    }

    result += text.slice(last);
    return { text: result, hyperlink };
}

function hydraToTableMetadata(arr = []) {
    if (!Array.isArray(arr) || arr.length < 1) {
        return { title: '', rows: [], unified_rows: [] };
    }

    const [header = [], ...rows] = arr;
    const maxLen = Math.max(header.length || 0, ...rows.map((r) => Array.isArray(r) ? r.length : 0), 1);
    const normalize = (r = []) => [...r, ...Array(maxLen - r.length).fill('')].map((x) => String(x ?? ''));

    const unified_rows = [
        { is_header: true, cells: normalize(header) },
        ...rows.map((r) => ({ is_header: false, cells: normalize(Array.isArray(r) ? r : [r]) }))
    ];

    return {
        title: '',
        rows: unified_rows.map((r) => ({
            items: r.cells,
            ...(r.is_header ? { isHeading: true } : {})
        })),
        unified_rows
    };
}

function hydraTokenizeCode(code = '', lang = 'javascript') {
    const keywordsMap = {
        javascript: new Set([
            'break', 'case', 'catch', 'continue', 'debugger', 'delete', 'do', 'else',
            'finally', 'for', 'function', 'if', 'in', 'instanceof', 'new', 'return',
            'switch', 'this', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'with',
            'true', 'false', 'null', 'undefined', 'class', 'const', 'let', 'super',
            'extends', 'export', 'import', 'yield', 'static', 'constructor', 'async',
            'await', 'get', 'set'
        ]),
        python: new Set([
            'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break',
            'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally',
            'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
            'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield'
        ])
    };

    const TYPE_MAP = {
        0: 'DEFAULT',
        1: 'KEYWORD',
        2: 'METHOD',
        3: 'STR',
        4: 'NUMBER',
        5: 'COMMENT'
    };

    const keywords = keywordsMap[lang] || keywordsMap.javascript;
    const tokens = [];
    let i = 0;

    const push = (content, type) => {
        if (!content) return;
        const last = tokens[tokens.length - 1];
        if (last && last.highlightType === type) last.codeContent += content;
        else tokens.push({ codeContent: content, highlightType: type });
    };

    while (i < code.length) {
        const c = code[i];

        if (/\s/.test(c)) {
            const s = i;
            while (i < code.length && /\s/.test(code[i])) i++;
            push(code.slice(s, i), 0);
            continue;
        }

        if ((c === '/' && code[i + 1] === '/') || (c === '#' && lang === 'python')) {
            const s = i;
            i += c === '#' ? 1 : 2;
            while (i < code.length && code[i] !== '\n') i++;
            push(code.slice(s, i), 5);
            continue;
        }

        if (c === '"' || c === "'" || c === '`') {
            const s = i;
            const q = c;
            i++;
            while (i < code.length) {
                if (code[i] === '\\' && i + 1 < code.length) i += 2;
                else if (code[i] === q) {
                    i++;
                    break;
                } else i++;
            }
            push(code.slice(s, i), 3);
            continue;
        }

        if (/[0-9]/.test(c)) {
            const s = i;
            while (i < code.length && /[0-9.]/.test(code[i])) i++;
            push(code.slice(s, i), 4);
            continue;
        }

        if (/[a-zA-Z_$]/.test(c)) {
            const s = i;
            while (i < code.length && /[a-zA-Z0-9_$]/.test(code[i])) i++;
            const word = code.slice(s, i);

            let type = 0;
            if (keywords.has(word)) type = 1;
            else {
                let j = i;
                while (j < code.length && /\s/.test(code[j])) j++;
                if (code[j] === '(') type = 2;
            }

            push(word, type);
            continue;
        }

        push(c, 0);
        i++;
    }

    return {
        codeBlock: tokens,
        unified_codeBlock: tokens.map((t) => ({
            content: t.codeContent,
            type: TYPE_MAP[t.highlightType] || 'DEFAULT'
        }))
    };
}


class hydra {
    constructor(utils, waUploadToServer, relayMessageFn) {
        this.utils = utils;
        this.relayMessage = relayMessageFn
        this.waUploadToServer = waUploadToServer;
    }

    detectType(content) {
        if (content.requestPaymentMessage) return 'PAYMENT';
        if (content.productMessage) return 'PRODUCT';
        if (content.interactiveMessage) return 'INTERACTIVE';
        if (content.albumMessage) return 'ALBUM';
        if (content.eventMessage) return 'EVENT';
        if (content.pollResultMessage) return 'POLL_RESULT';
        if (content.statusMentionMessage) return 'STATUS_MENTION';
        if (content.orderMessage) return 'ORDER';
        if (content.groupStatus) return 'GROUP_STATUS';
        if (content.carouselMessage || content.carousel) return 'CAROUSEL'; 
        if (content.stickerPack) return "STICKER_PACK";
        if (content.aiRich || content.airich || content.richResponse || content.richResponseMessage || content.AIRich) return 'AI_RICH';
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
            } else if (typeof thumbnail === 'object' && thumbnail.url) {
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
                nativeFlowMessage
            } = content.interactiveMessage;
            
            let media = null;
            let mediaType = null;
            
            if (thumbnail) {
                media = await this.utils.prepareWAMessageMedia(
                    { image: { url: thumbnail } },
                    { upload: this.waUploadToServer }
                );
                mediaType = 'image';
            } else if (image) {
                if (typeof image === 'object' && image.url) {
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
                mediaType = 'image';
            } else if (video) {
                if (typeof video === 'object' && video.url) {
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
                mediaType = 'video';
            } else if (document) {
                let documentPayload = { document: document };
                
                if (jpegThumbnail) {
                    if (typeof jpegThumbnail === 'object' && jpegThumbnail.url) {
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
                mediaType = 'document';
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
                    title: "",
                    hasMediaAttachment: true,
                    ...media
                };
            } else {
                interactiveMessage.header = {
                    title: "",
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
        
        async handleAlbum(content, jid, quoted) {
            const array = content.albumMessage;
            const album = await this.utils.generateWAMessageFromContent(jid, {
                messageContextInfo: {
                    messageSecret: crypto.randomBytes(32),
                },
                albumMessage: {
                    expectedImageCount: array.filter((a) => a.hasOwnProperty("image")).length,
                    expectedVideoCount: array.filter((a) => a.hasOwnProperty("video")).length,
                },
            }, {
                userJid: this.utils.generateMessageID().split('@')[0] + '@s.whatsapp.net',
                quoted,
                upload: this.waUploadToServer
            });
            
            await this.relayMessage(jid, album.message, {
                messageId: album.key.id,
            });
            
            for (let content of array) {
                const img = await this.utils.generateWAMessage(jid, content, {
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
                            participant: this.utils.generateMessageID().split('@')[0] + '@s.whatsapp.net',
                        },
                        message: album.message,
                    },
                });
            }
            return album;
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
                                ticket_id: crypto.randomBytes(16).toString('hex')
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
                            joinLink: eventData.joinLink || '',
                            startTime: typeof eventData.startTime === 'string' ? parseInt(eventData.startTime) : eventData.startTime || Date.now(),
                            endTime: typeof eventData.endTime === 'string' ? parseInt(eventData.endTime) : eventData.endTime || Date.now() + 3600000,
                            extraGuestsAllowed: eventData.extraGuestsAllowed !== false
                        }
                    }
                }
            }, { quoted });
            
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
                        optionVoteCount: typeof vote.optionVoteCount === 'number' 
                        ? vote.optionVoteCount.toString() 
                        : vote.optionVoteCount
                    })),
                    contextInfo: {
                        isForwarded: true,
                        forwardingScore: 1,
                        forwardedNewsletterMessageInfo: {
                            newsletterName: pollData.newsletter.newsletterName || "120363399602691477@newsletter",
                            newsletterJid: pollData.newsletter.newsletterJid || "Newsletter",
                            serverMessageId: 1000,
                            contentType: "UPDATE"
                        }
                    }
                }
            }, {
                userJid: this.utils.generateMessageID().split('@')[0] + '@s.whatsapp.net',
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
                if (typeof data.image === 'object' && data.image.url) {
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
                mediaType = 'image';
            } else if (data.video) {
                if (typeof data.video === 'object' && data.video.url) {
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
                mediaType = 'video';
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
            } else {
              if (typeof this.utils?.generateWAMessageContent === "function") {
                messageContent = await this.utils.generateWAMessageContent(storyData, {
                  upload: this.waUploadToServer
                });
              } else if (typeof this.utils?.generateWAMessageContent === "function") {
                messageContent = await this.utils.generateWAMessageContent(storyData, {
                  upload: this.waUploadToServer
                });
              } else if (typeof this.utils?.prepareMessageContent === "function") {
                messageContent = await this.utils.prepareMessageContent(storyData, {
                    upload: this.waUploadToServer
                });
              } else {
                messageContent = await Utils_1.generateWAMessageContent(storyData, {
                  upload: this.waUploadToServer
                });
              }
            }

            let msg = {
              message: {
                groupStatusMessageV2: {
                  message: messageContent.message || messageContent
                }
              }
            };

            return await this.relayMessage(jid, msg.message, {
              messageId: this.utils.generateMessageID()
            });
    }

    buildAIRichPayload(data = {}) {
        const submessages = [];
        const sections = [];
        const richResponseSources = [];

        const addText = (text = '', { hyperlink = true } = {}) => {
            const extracted = hyperlink ? hydraExtractHyperlink(String(text ?? '')) : { text: String(text ?? ''), hyperlink: [] };

            submessages.push({
                messageType: 2,
                messageText: extracted.text
            });

            sections.push({
                view_model: {
                    primitive: extracted.hyperlink.length
                        ? {
                            text: extracted.text,
                            inline_entities: extracted.hyperlink.map(({ reference_id, key, text, url }) => ({
                                key,
                                metadata: text?.trim()
                                    ? {
                                        display_name: text,
                                        is_trusted: true,
                                        url,
                                        __typename: 'GenAIInlineLinkItem'
                                    }
                                    : {
                                        reference_id,
                                        reference_url: url,
                                        reference_title: url,
                                        reference_display_name: url,
                                        sources: [],
                                        __typename: 'GenAISearchCitationItem'
                                    }
                            })),
                            __typename: 'GenAIMarkdownTextUXPrimitive'
                        }
                        : {
                            text: String(text ?? ''),
                            __typename: 'GenAIMarkdownTextUXPrimitive'
                        },
                    __typename: 'GenAISingleLayoutViewModel'
                }
            });
        };

        const addCode = (language = 'javascript', code = '') => {
            const meta = hydraTokenizeCode(String(code ?? ''), language);

            submessages.push({
                messageType: 5,
                codeMetadata: {
                    codeLanguage: language,
                    codeBlocks: meta.codeBlock
                }
            });

            sections.push({
                view_model: {
                    primitive: {
                        language,
                        code_blocks: meta.unified_codeBlock,
                        __typename: 'GenAICodeUXPrimitive'
                    },
                    __typename: 'GenAISingleLayoutViewModel'
                }
            });
        };

        const addTable = (table = []) => {
            const meta = hydraToTableMetadata(table);

            submessages.push({
                messageType: 4,
                tableMetadata: {
                    title: meta.title,
                    rows: meta.rows
                }
            });

            sections.push({
                view_model: {
                    primitive: {
                        rows: meta.unified_rows,
                        __typename: 'GenATableUXPrimitive'
                    },
                    __typename: 'GenAISingleLayoutViewModel'
                }
            });
        };

        const addImages = (images = []) => {
            const list = Array.isArray(images) ? images : [images];
            const imageUrls = list
                .filter(Boolean)
                .map((item) => {
                    const url = typeof item === 'string' ? item : item.url || item.imageUrl || item.imagePreviewUrl;
                    return {
                        imagePreviewUrl: url,
                        imageHighResUrl: item.imageHighResUrl || item.highResUrl || url,
                        sourceUrl: item.sourceUrl || data.sourceUrl || 'https://google.com'
                    };
                })
                .filter((x) => x.imagePreviewUrl);

            if (!imageUrls.length) return;

            submessages.push({
                messageType: 1,
                gridImageMetadata: {
                    gridImageUrl: {
                        imagePreviewUrl: imageUrls[0].imagePreviewUrl
                    },
                    imageUrls
                }
            });

            imageUrls.forEach(({ imagePreviewUrl }) => {
                sections.push({
                    view_model: {
                        primitive: {
                            media: {
                                url: imagePreviewUrl,
                                mime_type: 'image/jpeg'
                            },
                            imagine_type: 3,
                            status: {
                                status: 'READY'
                            },
                            __typename: 'GenAIImaginePrimitive'
                        },
                        __typename: 'GenAISingleLayoutViewModel'
                    }
                });
            });
        };

        const addSources = (sources = []) => {
            if (!Array.isArray(sources) || !sources.length) return;

            sections.push({
                view_model: {
                    primitive: {
                        sources: sources.map((source) => {
                            const arr = Array.isArray(source) ? source : null;
                            const profileUrl = arr ? arr[0] : source.profileIconUrl || source.faviconUrl || source.thumbnailUrl || '';
                            const url = arr ? arr[1] : source.url || source.sourceUrl || source.sourceProviderURL || '';
                            const text = arr ? arr[2] : source.title || source.sourceTitle || source.provider || 'Source';

                            return {
                                source_type: 'THIRD_PARTY',
                                source_display_name: text,
                                source_subtitle: source.subtitle || 'AI',
                                source_url: url,
                                favicon: {
                                    url: profileUrl,
                                    mime_type: 'image/jpeg',
                                    width: 16,
                                    height: 16
                                }
                            };
                        }),
                        __typename: 'GenAISearchResultPrimitive'
                    },
                    __typename: 'GenAISingleLayoutViewModel'
                }
            });
        };

        const addReels = (reelsItems = []) => {
            if (!Array.isArray(reelsItems) || !reelsItems.length) return;

            submessages.push({
                messageType: 9,
                contentItemsMetadata: {
                    contentType: 1,
                    itemsMetadata: reelsItems.map((item) => ({
                        reelItem: {
                            title: item.title || item.creator || '',
                            profileIconUrl: item.profileIconUrl || item.avatar_url || '',
                            thumbnailUrl: item.thumbnailUrl || item.thumbnail_url || '',
                            videoUrl: item.videoUrl || item.reels_url || item.url || '',
                        }
                    }))
                }
            });

            reelsItems.forEach((item, idx) => {
                richResponseSources.push({
                    provider: item.provider || 'UNKNOWN',
                    thumbnailCDNURL: item.thumbnailUrl || item.thumbnail_url || '',
                    sourceProviderURL: item.videoUrl || item.reels_url || item.url || '',
                    sourceQuery: '',
                    faviconCDNURL: item.profileIconUrl || item.avatar_url || '',
                    citationNumber: idx + 1,
                    sourceTitle: item.title || item.creator || `Reel ${idx + 1}`
                });
            });

            sections.push({
                view_model: {
                    primitives: reelsItems.map((item) => ({
                        reels_url: item.videoUrl || item.reels_url || item.url || '',
                        thumbnail_url: item.thumbnailUrl || item.thumbnail_url || '',
                        creator: item.title || item.creator || '',
                        avatar_url: item.profileIconUrl || item.avatar_url || '',
                        reels_title: item.reels_title || item.reelsTitle || item.title || '',
                        likes_count: item.likes_count || item.likesCount || 0,
                        shares_count: item.shares_count || item.sharesCount || 0,
                        view_count: item.view_count || item.viewCount || 0,
                        reel_source: item.reel_source || item.reelSource || 'IG',
                        is_verified: !!(item.is_verified ?? item.isVerified),
                        __typename: 'GenAIReelPrimitive'
                    })),
                    __typename: 'GenAIHScrollLayoutViewModel'
                }
            });
        };

        if (data.text) addText(data.text, { hyperlink: data.hyperlink !== false });
        if (Array.isArray(data.texts)) data.texts.forEach((text) => addText(text, { hyperlink: data.hyperlink !== false }));

        if (data.code) {
            if (typeof data.code === 'string') addCode(data.language || 'javascript', data.code);
            else addCode(data.code.language || data.language || 'javascript', data.code.content || data.code.code || '');
        }

        if (Array.isArray(data.codes)) {
            data.codes.forEach((item) => {
                if (typeof item === 'string') addCode(data.language || 'javascript', item);
                else addCode(item.language || data.language || 'javascript', item.content || item.code || '');
            });
        }

        if (data.table) addTable(data.table);
        if (data.image || data.images || data.gridImage) addImages(data.images || data.gridImage || data.image);
        if (data.sources) addSources(data.sources);
        if (data.reels || data.reel) addReels(data.reels || data.reel);

        const forwarded = data.forwarded !== false;
        const includesUnifiedResponse = data.includesUnifiedResponse !== false;

        return {
            messageContextInfo: {
                deviceListMetadata: {},
                deviceListMetadataVersion: 2,
                botMetadata: {
                    messageDisclaimerText: data.disclaimerText || data.messageDisclaimerText || '',
                    pluginMetadata: {},
                    richResponseSourcesMetadata: {
                        sources: data.richResponseSources || richResponseSources
                    }
                }
            },
            botForwardedMessage: {
                message: {
                    richResponseMessage: {
                        messageType: data.messageType || 1,
                        submessages,
                        unifiedResponse: {
                            data: includesUnifiedResponse
                                ? Buffer.from(JSON.stringify({
                                    response_id: data.responseId || crypto.randomUUID(),
                                    sections
                                })).toString('base64')
                                : ''
                        },
                        contextInfo: forwarded
                            ? {
                                forwardingScore: data.forwardingScore || 1,
                                isForwarded: true,
                                forwardedAiBotMessageInfo: {
                                    botJid: data.botJid || '0@bot'
                                },
                                forwardOrigin: data.forwardOrigin || 4,
                                ...(data.contextInfo || {})
                            }
                            : (data.contextInfo || {})
                    }
                }
            }
        };
    }

    async handleAIRich(content, jid, quoted, options = {}) {
        const data = content.aiRich || content.airich || content.richResponse || content.AIRich || content;

        const msg = this.buildAIRichPayload(data);

        return await this.relayMessage(jid, msg, {
            messageId: data.messageId || this.utils.generateMessageID?.() || crypto.randomBytes(10).toString('hex').toUpperCase(),
            ...(quoted ? { quoted } : {}),
            ...options
        });
    }


    }

export default hydra
