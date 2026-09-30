import makeWASocket from './Socket/index.js';
import chalk from "chalk"
import { AIRich, Button, ButtonV2, Carousel, MessageBuilder, Toolkit } from './MessageBuilder/index.js';
import * as messageBuilderExtras from './MessageBuilder/extras.js';
import * as metaAiSections from './MessageBuilder/metaai.js';
import * as botSignature from './MessageBuilder/bot-signature.js';
import * as nativeFlow from './Utils/native-flow.js';
import { nativeFlowButtonsViolateConstraints } from './Utils/messages.js';
console.log(chalk.blueBright(`Hi, thank you for using @kelvdra/baileys ^-^\nTelegram: @draa82\n`));
export * from '../WAProto/index.js';
export * from './Utils/index.js';
export * from './Types/index.js';
export * from './Store/index.js'; 
export * from './Defaults/index.js';
export * from './WABinary/index.js';
export * from './WAM/index.js';
export * from './WAUSync/index.js';
export * from './MessageBuilder/index.js';
export { MessageBuilder as KelvdraMessageBuilder, MessageBuilder as ElainaMessageBuilder } from './MessageBuilder/index.js';
export * from './MessageBuilder/extras.js';
export * from './MessageBuilder/metaai.js';
export * from './MessageBuilder/bot-signature.js';
export { VoipClient, ActiveCall, CallState, makeVoipClient, VideoFeeder, AudioFeeder, VIDEO_FORMAT_I420 } from './VoIP/index.js';
export { makeStickerPack } from './Utils/sticker-pack.js';
export { makeHumanizer } from './Utils/humanizer.js';
export { makeJidResolver } from './Utils/jid-resolver.js';
// Expose the builder helpers (sendA2UI, a2uiText, a2uiColumn, sendBloksWidget, the native-flow
// helpers, ...) on MB / MessageBuilder and on each builder class, so that
// `const { MB } = await import('@kelvdra/baileys'); await MB.sendA2UI(...)` works.
const builderMembers = [
    ...Object.entries(messageBuilderExtras),
    ...Object.entries(metaAiSections),
    ...Object.entries(botSignature),
    ...Object.entries(nativeFlow),
    ['nativeFlowButtonsViolateConstraints', nativeFlowButtonsViolateConstraints]
].filter(([name]) => name !== 'default');
for (const builder of [Button, ButtonV2, Carousel, AIRich, Toolkit]) {
    for (const [name, member] of builderMembers) {
        if (!(name in builder)) {
            Object.defineProperty(builder, name, { value: member, enumerable: true, configurable: true });
        }
    }
}
for (const [name, member] of builderMembers) {
    if (!(name in MessageBuilder)) {
        MessageBuilder[name] = member;
    }
}
export { makeWASocket };
export default makeWASocket;
//# sourceMappingURL=index.js.map
