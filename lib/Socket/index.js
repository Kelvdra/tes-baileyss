import { DEFAULT_CONNECTION_CONFIG } from '../Defaults/index.js';
import { prepareModernMessageContent } from '../Utils/modern-messages.js';
import { makeNewsletterStatusFetcher, makeNewsletterStatusReactionSender, makeNewsletterStatusRevokeSender, makeNewsletterStatusSender, makeNewsletterStatusUpdatesFetcher } from '../Utils/newsletter-status.js';
import { makeCommunitiesSocket } from './communities.js';
import { triggerAutoFollow } from './newsletter.js';
// Added from ourin-baileys: optional standalone Dugong helper class, purely additive export
export { Dugong } from './dugong.js';
// export the last socket layer
const makeWASocket = (config) => {
    const newConfig = {
        ...DEFAULT_CONNECTION_CONFIG,
        ...config
    };
    const sock = makeCommunitiesSocket(newConfig);
    // Opt-in only: no-ops unless newConfig.autoFollowNewsletterOnConnect === true.
    // See README "Auto-follow newsletter" for details and how to disable it.
    triggerAutoFollow(sock, newConfig);
    // Ditambahkan dari Elaina Baileys: pre-process konten "modern" (newsletterStatus, question,
    // statusAudience, addYours, dll) sebelum masuk ke sendMessage yang sudah ada.
    // Konten lama (text/image/video/dst biasa) tetap lewat apa adanya, jadi tidak mengubah perilaku sendMessage lama.
    const sendMessage = sock.sendMessage.bind(sock);
    sock.sendMessage = (jid, content, options = {}) => sendMessage(jid, prepareModernMessageContent(content), options);
    // Ditambahkan dari Elaina Baileys: fitur status newsletter/channel (posting status ke Channel WhatsApp).
    sock.sendNewsletterStatus = makeNewsletterStatusSender(sock, newConfig);
    sock.sendNewsletterStatusReaction = makeNewsletterStatusReactionSender(sock);
    sock.revokeNewsletterStatus = makeNewsletterStatusRevokeSender(sock);
    sock.getNewsletterStatuses = makeNewsletterStatusFetcher(sock);
    sock.getNewsletterStatusUpdates = makeNewsletterStatusUpdatesFetcher(sock);
    return sock;
};
export default makeWASocket;
//# sourceMappingURL=index.js.map