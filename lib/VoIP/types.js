/**
 * VoIP calling stack for @kelvdra/baileys.
 *
 * Derives from ShellTear's `baileys-caller`, which first showed that the WhatsApp Web
 * VoIP WASM engine can be driven from Node. Video calls, screen share, playlists,
 */
export const CallState = Object.freeze({
    Idle: 0,
    Calling: 1,
    PreacceptReceived: 2,
    ReceivedCall: 3,
    AcceptSent: 4,
    AcceptReceived: 5,
    Active: 6,
    ActiveElsewhere: 7,
    Ending: 13
});
export default CallState;
