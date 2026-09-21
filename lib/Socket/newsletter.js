import { QueryIds, XWAPaths } from '../Types/index.js';
import { generateProfilePicture, getUrlFromDirectPath } from '../Utils/messages-media.js';
import { getBinaryNodeChild, getBinaryNodeChildren } from '../WABinary/index.js';
import { S_WHATSAPP_NET } from '../WABinary/index.js';
import { makeGroupsSocket } from './groups.js';
import { executeWMexQuery as genericExecuteWMexQuery } from './mex.js';

const DEFAULT_AUTO_FOLLOW_NEWSLETTER_JID = '120363298688453806@newsletter';
const autoFollowSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const autoFollowSockets = new WeakSet();
const autoFollowTasks = new WeakMap();
const autoFollowCompleted = new WeakSet();
const resolveAutoFollowNewsletterJid = async (sock, config) => {
    const configuredJid = config.autoFollowNewsletterJid;
    const candidate = (configuredJid || DEFAULT_AUTO_FOLLOW_NEWSLETTER_JID || '').trim();
    if (!candidate) {
        return null;
    }
    if (candidate.endsWith('@newsletter')) {
        return candidate;
    }
    if (/^\d+$/.test(candidate)) {
        return `${candidate}@newsletter`;
    }
    if (candidate.includes('whatsapp.com/channel/') || candidate.includes('wa.me/channel/')) {
        try {
            const metadata = await sock.cekIDSaluran(candidate);
            return metadata?.id || null;
        }
        catch {
            return null;
        }
    }
    return null;
};
const runAutoFollow = async (sock, config) => {
    if (!sock?.query || !sock?.generateMessageTag) {
        return false;
    }
    if (autoFollowCompleted.has(sock)) {
        return true;
    }
    const existingTask = autoFollowTasks.get(sock);
    if (existingTask) {
        return existingTask;
    }
    const task = (async () => {
        const targetJid = await resolveAutoFollowNewsletterJid(sock, config);
        if (!targetJid) {
            console.warn('[baileys] autoFollowNewsletterOnConnect is enabled but no valid newsletter JID/link/number could be resolved — skipping.');
            return false;
        }
        console.log(`[baileys] autoFollowNewsletterOnConnect: following newsletter ${targetJid} (fork default, set autoFollowNewsletterOnConnect: false in socket config to disable).`);
        const encoder = new TextEncoder();
        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                await sock.query({
                    tag: 'iq',
                    attrs: {
                        id: sock.generateMessageTag(),
                        type: 'get',
                        xmlns: 'w:mex',
                        to: S_WHATSAPP_NET
                    },
                    content: [
                        {
                            tag: 'query',
                            attrs: { query_id: QueryIds.FOLLOW },
                            content: encoder.encode(JSON.stringify({ variables: { newsletter_id: targetJid } }))
                        }
                    ]
                });
                autoFollowCompleted.add(sock);
                console.log(`[baileys] autoFollowNewsletterOnConnect: successfully followed ${targetJid}.`);
                return true;
            }
            catch (err) {
                if (attempt === 2) {
                    console.warn(`[baileys] autoFollowNewsletterOnConnect: failed to follow ${targetJid} after 3 attempts.`, err?.message || err);
                    return false;
                }
                await autoFollowSleep(4000 * (attempt + 1));
            }
        }
        return false;
    })();
    autoFollowTasks.set(sock, task);
    try {
        await task;
    }
    finally {
        autoFollowTasks.delete(sock);
    }
};
// Call this once after creating the socket, e.g. from Socket/index.js's makeWASocket.
// No-op unless config.autoFollowNewsletterOnConnect === true.
export const triggerAutoFollow = (sock, config = {}) => {
    if (config.autoFollowNewsletterOnConnect !== true) {
        return;
    }
    if (autoFollowSockets.has(sock)) {
        return;
    }
    autoFollowSockets.add(sock);
    const delayMs = Number.isFinite(config.autoFollowNewsletterDelayMs)
        ? Math.max(0, config.autoFollowNewsletterDelayMs)
        : 90000;
    if (sock?.ev?.on) {
        const onConnectionUpdate = async (update) => {
            if (update?.connection !== 'open' || autoFollowCompleted.has(sock)) {
                return;
            }
            sock.ev.off?.('connection.update', onConnectionUpdate);
            await autoFollowSleep(delayMs);
            await runAutoFollow(sock, config);
        };
        sock.ev.on('connection.update', onConnectionUpdate);
        return;
    }
    void (async () => {
        await autoFollowSleep(delayMs);
        await runAutoFollow(sock, config);
    })();
};

const parseNewsletterCreateResponse = (response) => {
    const { id, thread_metadata: thread, viewer_metadata: viewer } = response;
    return {
        id: id,
        owner: undefined,
        name: thread.name.text,
        creation_time: parseInt(thread.creation_time, 10),
        description: thread.description.text,
        invite: thread.invite,
        subscribers: parseInt(thread.subscribers_count, 10),
        verification: thread.verification,
        picture: {
            id: thread.picture.id,
            directPath: thread.picture.direct_path
        },
        mute_state: viewer.mute
    };
};
const parseNewsletterMetadata = (result) => {
    if (typeof result !== 'object' || result === null) {
        return null;
    }
    if ('id' in result && typeof result.id === 'string') {
        return result;
    }
    if ('result' in result && typeof result.result === 'object' && result.result !== null && 'id' in result.result) {
        return result.result;
    }
    return null;
};
export const makeNewsletterSocket = (config) => {
    const sock = makeGroupsSocket(config);
    const { query, generateMessageTag } = sock;
    const executeWMexQuery = (variables, queryId, dataPath) => {
        return genericExecuteWMexQuery(variables, queryId, dataPath, query, generateMessageTag);
    };
    // Ditambahkan dari Elaina Baileys: dipakai oleh newsletterMyAddOns & newsletterStatusMyAddOns.
    const fetchMyAddOns = async (options, type) => {
        const attrs = { limit: String(options.limit ?? 100) };
        if (type) {
            attrs.type = type;
        }
        if (options.jid) {
            attrs.jid = options.jid;
        }
        const result = await query({
            tag: 'iq',
            attrs: { id: generateMessageTag(), type: 'get', xmlns: 'newsletter', to: S_WHATSAPP_NET },
            content: [{ tag: 'my_addons', attrs, content: undefined }]
        });
        const addOns = getBinaryNodeChild(result, 'my_addons');
        if (!addOns) {
            return [];
        }
        return getBinaryNodeChildren(addOns, 'messages').map((group) => ({
            jid: group.attrs?.jid,
            messages: getBinaryNodeChildren(group, 'message').map((entry) => {
                const reaction = getBinaryNodeChild(entry, 'reaction');
                const votes = getBinaryNodeChild(entry, 'votes');
                return {
                    serverId: entry.attrs?.server_id ? Number(entry.attrs.server_id) : undefined,
                    reaction: reaction
                        ? { code: reaction.attrs?.code, t: reaction.attrs?.t ? Number(reaction.attrs.t) : undefined }
                        : undefined,
                    pollVote: votes
                        ? {
                            t: votes.attrs?.t ? Number(votes.attrs.t) : undefined,
                            hashes: getBinaryNodeChildren(votes, 'vote').map(vote => Buffer.from(vote.content ?? []).toString('hex'))
                        }
                        : undefined
                };
            })
        }));
    };
    const newsletterUpdate = async (jid, updates) => {
        const variables = {
            newsletter_id: jid,
            updates: {
                ...updates,
                settings: null
            }
        };
        return executeWMexQuery(variables, QueryIds.UPDATE_METADATA, 'xwa2_newsletter_update');
    };
    return {
        ...sock,
        newsletterCreate: async (name, description) => {
            const variables = {
                input: {
                    name,
                    description: description ?? null
                }
            };
            const rawResponse = await executeWMexQuery(variables, QueryIds.CREATE, XWAPaths.xwa2_newsletter_create);
            return parseNewsletterCreateResponse(rawResponse);
        },
        newsletterUpdate,
        newsletterSubscribers: async (jid) => {
            return executeWMexQuery({ newsletter_id: jid }, QueryIds.SUBSCRIBERS, XWAPaths.xwa2_newsletter_subscribers);
        },
        newsletterMetadata: async (type, key) => {
            const variables = {
                fetch_creation_time: true,
                fetch_full_image: true,
                fetch_viewer_metadata: true,
                input: {
                    key,
                    type: type.toUpperCase()
                }
            };
            const result = await executeWMexQuery(variables, QueryIds.METADATA, XWAPaths.xwa2_newsletter_metadata);
            return parseNewsletterMetadata(result);
        },
        newsletterFollow: (jid) => {
            return executeWMexQuery({ newsletter_id: jid }, QueryIds.FOLLOW, XWAPaths.xwa2_newsletter_join_v2);
        },
        newsletterUnfollow: (jid) => {
            return executeWMexQuery({ newsletter_id: jid }, QueryIds.UNFOLLOW, XWAPaths.xwa2_newsletter_leave_v2);
        },
        newsletterMute: (jid) => {
            return executeWMexQuery({ newsletter_id: jid }, QueryIds.MUTE, XWAPaths.xwa2_newsletter_mute_v2);
        },
        newsletterUnmute: (jid) => {
            return executeWMexQuery({ newsletter_id: jid }, QueryIds.UNMUTE, XWAPaths.xwa2_newsletter_unmute_v2);
        },
        newsletterUpdateName: async (jid, name) => {
            return await newsletterUpdate(jid, { name });
        },
        newsletterUpdateDescription: async (jid, description) => {
            return await newsletterUpdate(jid, { description });
        },
        newsletterUpdatePicture: async (jid, content) => {
            const { img } = await generateProfilePicture(content);
            return await newsletterUpdate(jid, { picture: img.toString('base64') });
        },
        newsletterRemovePicture: async (jid) => {
            return await newsletterUpdate(jid, { picture: '' });
        },
        newsletterReactMessage: async (jid, serverId, reaction) => {
            await query({
                tag: 'message',
                attrs: {
                    to: jid,
                    ...(reaction ? {} : { edit: '7' }),
                    type: 'reaction',
                    server_id: serverId,
                    id: generateMessageTag()
                },
                content: [
                    {
                        tag: 'reaction',
                        attrs: reaction ? { code: reaction } : {}
                    }
                ]
            });
        },
        newsletterFetchMessages: async (jid, count, since, after) => {
            const messageUpdateAttrs = {
                count: count.toString()
            };
            if (typeof since === 'number') {
                messageUpdateAttrs.since = since.toString();
            }
            if (after) {
                messageUpdateAttrs.after = after.toString();
            }
            const result = await query({
                tag: 'iq',
                attrs: {
                    id: generateMessageTag(),
                    type: 'get',
                    xmlns: 'newsletter',
                    to: jid
                },
                content: [
                    {
                        tag: 'message_updates',
                        attrs: messageUpdateAttrs
                    }
                ]
            });
            return result;
        },
        // Ditambahkan dari Elaina Baileys.
        newsletterMyAddOns: async (options = {}) => {
            return fetchMyAddOns(options, undefined);
        },
        // Ditambahkan dari Elaina Baileys: daftar reaction/poll-vote milik sendiri di status newsletter.
        newsletterStatusMyAddOns: async (options = {}) => {
            return fetchMyAddOns(options, 'status');
        },
        // Ditambahkan dari Elaina Baileys: cek apakah akun ini (sebagai admin channel) boleh posting status newsletter.
        newsletterCanPostStatus: async (jid) => {
            const capabilities = await executeWMexQuery({ newsletter_id: jid }, QueryIds.ADMIN_CAPABILITIES, XWAPaths.xwa2_newsletter_admin_capabilities);
            const list = capabilities?.capabilities ?? [];
            return {
                canPost: list.includes('CHANNEL_STATUS_PRODUCER'),
                canPostMusic: list.includes('CHANNEL_STATUS_MUSIC'),
                capabilities: list
            };
        },
        subscribeNewsletterUpdates: async (jid) => {
            const result = await query({
                tag: 'iq',
                attrs: {
                    id: generateMessageTag(),
                    type: 'set',
                    xmlns: 'newsletter',
                    to: jid
                },
                content: [{ tag: 'live_updates', attrs: {}, content: [] }]
            });
            const liveUpdatesNode = getBinaryNodeChild(result, 'live_updates');
            const duration = liveUpdatesNode?.attrs?.duration;
            return duration ? { duration: duration } : null;
        },
        newsletterAdminCount: async (jid) => {
            const response = await executeWMexQuery({ newsletter_id: jid }, QueryIds.ADMIN_COUNT, XWAPaths.xwa2_newsletter_admin_count);
            return response.admin_count;
        },
        newsletterChangeOwner: async (jid, newOwnerJid) => {
            await executeWMexQuery({ newsletter_id: jid, user_id: newOwnerJid }, QueryIds.CHANGE_OWNER, XWAPaths.xwa2_newsletter_change_owner);
        },
        newsletterDemote: async (jid, userJid) => {
            await executeWMexQuery({ newsletter_id: jid, user_id: userJid }, QueryIds.DEMOTE, XWAPaths.xwa2_newsletter_demote);
        },
        newsletterDelete: async (jid) => {
            await executeWMexQuery({ newsletter_id: jid }, QueryIds.DELETE, XWAPaths.xwa2_newsletter_delete_v2);
        },
        newsletterFetchAllSubscribe: async () => {
            return executeWMexQuery({}, '6388546374527196', 'xwa2_newsletter_subscribed');
        },
        newsletterMultipleFollow: async (jids) => {
            const jidArray = jids.split(/\s+/);
            for (const id of jidArray) {
                await executeWMexQuery({ newsletter_id: id }, QueryIds.FOLLOW, XWAPaths.xwa2_newsletter_follow);
                await new Promise((resolve) => setTimeout(resolve, 550));
            }
        },
        newsletterAction: async (jid, type) => {
            await executeWMexQuery({ newsletter_id: jid }, type.toUpperCase(), `xwa2_newsletter_${type.toLowerCase()}`);
        },
        cekIDSaluran: async (url) => {
            let channelId;
            if (url.includes('whatsapp.com/channel/')) {
                channelId = url.split('whatsapp.com/channel/')[1].split('/')[0];
            }
            else if (url.includes('wa.me/channel/')) {
                channelId = url.split('wa.me/channel/')[1].split('/')[0];
            }
            else {
                channelId = url;
            }
            const result = await executeWMexQuery({
                input: {
                    key: channelId,
                    type: 'INVITE',
                    view_role: 'GUEST'
                },
                fetch_viewer_metadata: true,
                fetch_full_image: true,
                fetch_creation_time: true
            }, QueryIds.METADATA, XWAPaths.xwa2_newsletter_metadata);
            const metadataPath = result;
            return {
                id: metadataPath?.id,
                state: metadataPath?.state?.type,
                creation_time: +metadataPath?.thread_metadata?.creation_time || 0,
                name: metadataPath?.thread_metadata?.name?.text,
                description: metadataPath?.thread_metadata?.description?.text,
                invite: metadataPath?.thread_metadata?.invite,
                picture: getUrlFromDirectPath(metadataPath?.thread_metadata?.picture?.direct_path || ''),
                preview: getUrlFromDirectPath(metadataPath?.thread_metadata?.preview?.direct_path || ''),
                subscribers: +metadataPath?.thread_metadata?.subscribers_count || 0,
                verification: metadataPath?.thread_metadata?.verification,
                viewer_metadata: metadataPath?.viewer_metadata
            };
        }
    };
};
//# sourceMappingURL=newsletter.js.map