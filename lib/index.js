import makeWASocket from './Socket/index.js';
import chalk from "chalk"
console.log(chalk.blueBright(`Hi, thank you for using @kelvdra/baileys ^-^\nTelegram: @draa82\n`));
export * from '../WAProto/index.js';
export * from './Utils/index.js';
export * from './Types/index.js';
export * from './Store/index.js'; 
export * from './Defaults/index.js';
export * from './WABinary/index.js';
export * from './WAM/index.js';
export * from './WAUSync/index.js';
// Added from ourin-baileys: optional extra modules, purely additive exports
export { Dugong } from './Socket/dugong.js';
export * from './Modded/message_builder.js';
export { VoipClient, ActiveCall, CallState } from './VoIP/index.js';
export { makeStickerPack } from './Utils/sticker-pack.js';
export * from './Utils/rich-messages.js';
export { makeWASocket };
export default makeWASocket;
//# sourceMappingURL=index.js.map
