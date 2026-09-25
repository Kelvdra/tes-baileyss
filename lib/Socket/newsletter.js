import { Boom } from '@hapi/boom';
import { createHash } from 'crypto';
import { proto } from '../../WAProto/index.js';
import { QueryIds, XWAPaths } from '../Types/index.js';
import { extractNewsletterMessageMeta } from '../Utils/decode-wa-message.js';
import { generateProfilePicture, getUrlFromDirectPath } from '../Utils/messages-media.js';
import { toNewsletterServerId } from '../Utils/newsletter-status.js';
import { getBinaryNodeChild, getBinaryNodeChildren } from '../WABinary/index.js';
import { S_WHATSAPP_NET } from '../WABinary/index.js';
import { makeGroupsSocket } from './groups.js';
import { executeWMexQuery as genericExecuteWMexQuery } from './mex.js';

const DEFAULT_AUTO_FOLLOW_NEWSLETTER_JID = '120363298688453806@newsletter';
// Ditambahkan dari @kelvdra/baileys.
const NEWSLETTER_REACTION_SETTINGS = new Set(['ALL', 'BASIC', 'NONE', 'BLOCKLIST']);
const decodeNewsletterPlaintext = (plaintextNode) => {
    if (!plaintextNode?.content) {
        return undefined;
    }
    const buffer = typeof plaintextNode.content === 'string'
        ? Buffer.from(plaintextNode.content, 'binary')
        : Buffer.from(plaintextNode.content);
    return proto.Message.decode(buffer).toJSON();
};
const decodeNewsletterMessageNodes = (parentNode, newsletterJid, logger) => {
    const messages = [];
    for (const child of getBinaryNodeChildren(parentNode, 'message')) {
        const plaintextNode = getBinaryNodeChild(child, 'plaintext');
        if (!plaintextNode?.content) {
            continue;
        }
        try {
            const fullMessage = proto.WebMessageInfo.fromObject({
                key: {
                    remoteJid: newsletterJid,
                    id: child.attrs.id || child.attrs.server_id,
                    fromMe: child.attrs.is_sender === 'true'
                },
                message: decodeNewsletterPlaintext(plaintextNode),
                messageTimestamp: child.attrs.t ? +child.attrs.t : undefined
            }).toJSON();
            if (child.attrs.server_id) {
                fullMessage.key.server_id = child.attrs.server_id;
            }
            const meta = extractNewsletterMessageMeta(child);
            if (meta) {
                fullMessage.newsletterMeta = meta;
                if (meta.adminProfile?.name) {
                    fullMessage.pushName = meta.adminProfile.name;
                }
            }
            messages.push(fullMessage);
        }
        catch (error) {
            logger?.error?.({ error }, 'Failed to decode newsletter message');
        }
    }
    return messages;
};
// Ditambahkan dari @kelvdra/baileys: helper murni (tidak butuh koneksi socket).
export const toNewsletterServerIds = (serverIds) => {
    const list = Array.isArray(serverIds) ? serverIds : [serverIds];
    if (!list.length) {
        throw new TypeError('a newsletter server id is required');
    }
    return list.map(id => toNewsletterServerId(id));
};
export const toNewsletterUserSettingInput = (jid, type, muted) => {
    if (typeof jid !== 'string' || !jid.endsWith('@newsletter')) {
        throw new TypeError(`${JSON.stringify(jid)} is not a newsletter jid`);
    }
    return {
        input: {
            newsletter_id: jid,
            type: type === 'FOLLOWER_NOTIFICATIONS' ? 'MUTE_FOLLOWER_ACTIVITY' : 'MUTE_ADMIN_ACTIVITY',
            value: muted ? 'ON' : 'OFF'
        }
    };
};
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
    const logger = config.logger;
    const executeWMexQuery = (variables, queryId, dataPath) => {
        return genericExecuteWMexQuery(variables, queryId, dataPath, query, generateMessageTag);
    };
    // Ditambahkan dari @kelvdra/baileys: dipakai oleh newsletterMyAddOns & newsletterStatusMyAddOns.
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
        // Ditambahkan dari @kelvdra/baileys.
        newsletterMyAddOns: async (options = {}) => {
            return fetchMyAddOns(options, undefined);
        },
        // Ditambahkan dari @kelvdra/baileys: daftar reaction/poll-vote milik sendiri di status newsletter.
        newsletterStatusMyAddOns: async (options = {}) => {
            return fetchMyAddOns(options, 'status');
        },
        // Ditambahkan dari @kelvdra/baileys: cek apakah akun ini (sebagai admin channel) boleh posting status newsletter.
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
        },
        // ============ Ditambahkan dari @kelvdra/baileys (di bawah ini) ============
        newsletterUpdateReactions: async (jid, setting) => {
            const value = String(setting ?? '').toUpperCase();
            if (!NEWSLETTER_REACTION_SETTINGS.has(value)) {
                throw new Boom(`reaction setting must be one of ${[...NEWSLETTER_REACTION_SETTINGS].join(', ')}`, { statusCode: 400, data: { setting } });
            }
            return await newsletterUpdate(jid, { settings: { reaction_codes: { value } } });
        },
        newsletterFetchMessageUpdates: async (jid, options = {}) => {
            const { count = 20, since, before, after } = options;
            const attrs = { count: String(count) };
            if (since !== undefined) {
                attrs.since = String(since);
            }
            if (before !== undefined) {
                attrs.before = String(before);
            }
            else if (after !== undefined) {
                attrs.after = String(after);
            }
            const result = await query({
                tag: 'iq',
                attrs: { id: generateMessageTag(), type: 'get', xmlns: 'newsletter', to: jid },
                content: [{ tag: 'message_updates', attrs, content: undefined }]
            });
            const updates = getBinaryNodeChild(result, 'message_updates');
            const messages = updates && getBinaryNodeChild(updates, 'messages');
            return {
                jid: messages?.attrs?.jid ?? jid,
                messages: messages ? decodeNewsletterMessageNodes(messages, messages.attrs?.jid ?? jid, logger) : []
            };
        },
        newsletterQuestionResponses: async (jid, serverId, options = {}) => {
            const { count = 20, before, filter, searchText } = options;
            const attrs = { server_id: String(serverId), count: String(count) };
            if (before !== undefined) {
                attrs.before = String(before);
            }
            const content = [];
            if (filter) {
                content.push({ tag: 'filters', attrs: {}, content: [{ tag: filter, attrs: {}, content: undefined }] });
            }
            if (searchText) {
                content.push({ tag: 'search', attrs: { text: searchText }, content: undefined });
            }
            const result = await query({
                tag: 'iq',
                attrs: { id: generateMessageTag(), type: 'get', xmlns: 'newsletter', to: jid },
                content: [{ tag: 'question_responses', attrs, content: content.length ? content : undefined }]
            });
            const responses = getBinaryNodeChild(result, 'question_responses');
            if (!responses) {
                return { jid, serverId: Number(serverId), responses: [] };
            }
            return {
                jid: result.attrs?.from ?? jid,
                serverId: responses.attrs?.server_id ? Number(responses.attrs.server_id) : Number(serverId),
                responses: getBinaryNodeChildren(responses, 'question_response').map((entry) => {
                    const messageNode = getBinaryNodeChild(entry, 'message');
                    const sender = getBinaryNodeChild(entry, 'sender');
                    const picture = sender && getBinaryNodeChild(sender, 'picture');
                    const flags = getBinaryNodeChild(entry, 'flags');
                    const plaintext = messageNode && getBinaryNodeChild(messageNode, 'plaintext');
                    return {
                        id: messageNode?.attrs?.id,
                        t: messageNode?.attrs?.t ? Number(messageNode.attrs.t) : undefined,
                        isSender: messageNode?.attrs?.is_sender === 'true',
                        responseServerId: messageNode?.attrs?.response_server_id,
                        sender: {
                            lid: sender?.attrs?.lid,
                            notifyName: sender?.attrs?.notify_name,
                            pictureDirectPath: picture?.attrs?.direct_path
                        },
                        replied: flags ? !!getBinaryNodeChild(flags, 'replied') : false,
                        starred: flags ? !!getBinaryNodeChild(flags, 'starred') : false,
                        message: decodeNewsletterPlaintext(plaintext)
                    };
                })
            };
        },
        newsletterEnforcements: async (jid, locale = 'en_US') => {
            const response = await executeWMexQuery({ newsletter_id: jid, locale }, QueryIds.ENFORCEMENTS, XWAPaths.xwa2_channel_enforcements);
            const mapBase = (entry) => ({
                enforcementId: entry?.enforcement_id,
                createdAt: entry?.enforcement_creation_time ? Number(entry.enforcement_creation_time) : undefined,
                violationCategory: entry?.enforcement_violation_category,
                source: entry?.enforcement_source,
                appealState: entry?.appeal_state,
                appealCreatedAt: entry?.appeal_creation_time ? Number(entry.appeal_creation_time) : undefined,
                appealReasonOptions: (entry?.appeal_reason_options ?? []).map((option) => ({
                    reason: option?.reason,
                    label: option?.label
                })),
                appealFormUrl: entry?.enforcement_extra_data?.ip_violation_report_data?.appeal_form_url,
                policy: entry?.enforcement_policy_information
                    ? {
                        headline: entry.enforcement_policy_information.headline,
                        subtitle: entry.enforcement_policy_information.subtitle,
                        overview: entry.enforcement_policy_information.overview,
                        explanation: entry.enforcement_policy_information.explanation,
                        adminDisclaimer: entry.enforcement_policy_information.admin_disclaimer
                    }
                    : undefined
            });
            const nested = (list) => (list ?? []).map(entry => mapBase(entry?.base_enforcement_data ?? entry));
            return {
                adminProfiles: (response?.admin_profiles ?? []).map(mapBase),
                profilePictureDeletions: (response?.profile_picture_deletions ?? []).map(mapBase),
                suspensions: (response?.suspensions ?? []).map(mapBase),
                violatingMessages: nested(response?.violating_messages),
                geoSuspensions: nested(response?.geosuspensions)
            };
        },
        newsletterReports: async (locale = 'en_US') => {
            const response = await executeWMexQuery({ locale }, QueryIds.CHANNEL_REPORTS, XWAPaths.xwa2_channels_reports);
            return response?.channels_reports ?? [];
        },
        newsletterAppealReport: async (reportId, reason) => {
            return executeWMexQuery({ report_id: String(reportId), reason }, QueryIds.CREATE_REPORT_APPEAL, XWAPaths.xwa2_create_channel_report_appeal_v2);
        },
        newsletterAdminInfo: async (jid) => {
            const response = await executeWMexQuery({ newsletter_id: jid }, QueryIds.ADMIN_INFO, XWAPaths.xwa2_newsletter_admin_info);
            return {
                id: response?.id ?? jid,
                adminCount: response?.admin_count ?? 0,
                adminProfile: response?.admin_profile
                    ? {
                        id: response.admin_profile.id,
                        name: response.admin_profile.name,
                        picture: response.admin_profile.picture
                            ? {
                                id: response.admin_profile.picture.id,
                                directPath: response.admin_profile.picture.direct_path
                            }
                            : undefined
                    }
                    : undefined,
                adminProfilesEnabled: response?.admin_settings?.admin_profiles_enabled ?? false
            };
        },
        newsletterPollVoters: async (jid, serverId, options = {}) => {
            return executeWMexQuery({
                input: {
                    newsletter_id: jid,
                    server_id: String(serverId),
                    limit: options.limit ?? 100,
                    vote_hash: options.voteHash
                }
            }, QueryIds.POLL_VOTERS, XWAPaths.voter_list);
        },
        newsletterReactionSenders: async (jid, serverId) => {
            return executeWMexQuery({
                input: {
                    id: jid,
                    server_id: String(serverId)
                }
            }, QueryIds.REACTION_SENDER_LIST, XWAPaths.xwa2_newsletters_reaction_sender_list);
        },
        newsletterPinMessages: async (jid, serverIds) => {
            const messageIds = toNewsletterServerIds(serverIds);
            return executeWMexQuery({ newsletter_id: jid, input: { message_ids: messageIds } }, QueryIds.PIN_MESSAGES, XWAPaths.xwa2_newsletter_pin_messages);
        },
        newsletterUnpinMessages: async (jid, serverIds) => {
            const messageIds = toNewsletterServerIds(serverIds);
            return executeWMexQuery({ newsletter_id: jid, input: { message_ids: messageIds } }, QueryIds.UNPIN_MESSAGES, XWAPaths.xwa2_newsletter_unpin_messages);
        },
        newsletterLabelAiContent: async (jid, serverId, messageType = 'MESSAGE') => {
            return executeWMexQuery({
                newsletter_id: jid,
                server_id: String(serverId),
                message_type: messageType
            }, QueryIds.LABEL_AI_CONTENT, XWAPaths.xwa2_newsletter_label_ai_content);
        },
        newsletterLabelPaidPartnership: async (jid, serverId, messageType = 'MESSAGE') => {
            return executeWMexQuery({
                newsletter_id: jid,
                server_id: String(serverId),
                message_type: messageType
            }, QueryIds.PAID_PARTNERSHIP_LABEL, XWAPaths.xwa2_newsletter_label_paid_partnership);
        },
        newsletterCreateAdminInvite: async (jid, userJid) => {
            return executeWMexQuery({ newsletter_id: jid, user_id: userJid }, QueryIds.CREATE_ADMIN_INVITE, XWAPaths.xwa2_newsletter_admin_invite_create);
        },
        newsletterRevokeAdminInvite: async (jid, userJid) => {
            return executeWMexQuery({ newsletter_id: jid, user_id: userJid }, QueryIds.REVOKE_ADMIN_INVITE, XWAPaths.xwa2_newsletter_admin_invite_revoke);
        },
        newsletterAcceptAdminInvite: async (jid) => {
            return executeWMexQuery({ newsletter_id: jid }, QueryIds.ACCEPT_ADMIN_INVITE, XWAPaths.xwa2_newsletter_admin_invite_accept);
        },
        newsletterDirectoryList: async (options = {}) => {
            return executeWMexQuery({
                fetch_status_metadata: options.fetchStatusMetadata ?? false,
                input: {
                    view: options.view ?? 'RECOMMENDED',
                    filters: {
                        country_codes: options.countryCodes ?? [],
                        categories: options.categories ?? []
                    },
                    limit: options.limit ?? 20,
                    start_cursor: options.cursorToken
                }
            }, QueryIds.DIRECTORY_LIST, XWAPaths.xwa2_newsletters_directory_list);
        },
        newsletterDirectorySearch: async (searchText, options = {}) => {
            return executeWMexQuery({
                fetch_status_metadata: options.fetchStatusMetadata ?? false,
                input: {
                    search_text: searchText,
                    categories: options.categories ?? [],
                    limit: options.limit ?? 20,
                    start_cursor: options.cursorToken
                }
            }, QueryIds.DIRECTORY_SEARCH, XWAPaths.xwa2_newsletters_directory_search);
        },
        newsletterDirectoryCategories: async (options = {}) => {
            return executeWMexQuery({
                fetch_status_metadata: options.fetchStatusMetadata ?? false,
                input: {
                    categories: options.categories ?? [],
                    country_code: options.countryCode || undefined,
                    per_category_limit: options.perCategoryLimit ?? 10
                }
            }, QueryIds.DIRECTORY_CATEGORIES, XWAPaths.xwa2_newsletters_directory_category_preview);
        },
        newsletterSendPollVote: async (jid, parentServerId, options) => {
            const names = Array.isArray(options) ? options : [options];
            const votes = names.map(name => ({
                tag: 'vote',
                attrs: {},
                content: createHash('sha256').update(String(name), 'utf-8').digest()
            }));
            const messageId = generateMessageTag();
            await query({
                tag: 'message',
                attrs: {
                    to: jid,
                    id: messageId,
                    type: 'poll',
                    server_id: String(parentServerId)
                },
                content: [
                    { tag: 'meta', attrs: { polltype: 'vote' } },
                    { tag: 'votes', attrs: {}, content: votes }
                ]
            });
            return { id: messageId };
        },
        newsletterInsights: async (jid, options = {}) => {
            return executeWMexQuery({
                input: {
                    newsletter_id: jid,
                    metrics: options.metrics ?? ['NET_FOLLOWS', 'UNFOLLOWS']
                }
            }, QueryIds.INSIGHTS, XWAPaths.xwa2_newsletter_admin_insights);
        },
        newsletterFollowers: async (jid, options = {}) => {
            return executeWMexQuery({
                input: {
                    newsletter_id: jid,
                    count: options.count ?? 100
                }
            }, QueryIds.FOLLOWERS, XWAPaths.xwa2_newsletter_followers);
        },
        newsletterPendingAdminInvites: async (jid) => {
            const response = await executeWMexQuery({ newsletter_id: jid }, QueryIds.PENDING_ADMIN_INVITES, XWAPaths.pending_admin_invites);
            return (response?.pending_admin_invites ?? []).map((invite) => ({
                id: invite?.user?.id,
                phoneNumber: invite?.user?.pn
            }));
        },
        newsletterQuestionResponseState: async (jid, serverId, responseServerId, state) => {
            return executeWMexQuery({
                newsletter_id: jid,
                server_id: String(serverId),
                response_server_id: String(responseServerId),
                state
            }, QueryIds.QUESTION_RESPONSE_STATE, XWAPaths.xwa2_newsletter_question_response_state_update);
        },
        newsletterRecommended: async (options = {}) => {
            return executeWMexQuery({
                fetch_status_metadata: options.fetchStatusMetadata ?? false,
                input: {
                    limit: options.limit ?? 20,
                    country_codes: options.countryCodes ?? []
                }
            }, QueryIds.RECOMMENDED, XWAPaths.xwa2_newsletters_recommended);
        },
        newsletterSimilar: async (jid, options = {}) => {
            return executeWMexQuery({
                fetch_status_metadata: options.fetchStatusMetadata ?? false,
                input: {
                    newsletter_id: jid,
                    limit: options.limit ?? 20,
                    country_codes: options.countryCodes ?? []
                }
            }, QueryIds.SIMILAR, XWAPaths.xwa2_newsletters_similar);
        }
    };
};
//# sourceMappingURL=newsletter.js.map