export type HumanizeConfig = {
    enabled?: boolean;
    /** delay minimum dalam ms (default 800) */
    minDelay?: number;
    /** delay maksimum dalam ms (default 2300) */
    maxDelay?: number;
    /** kirim presence composing selama delay (default true) */
    typing?: boolean;
    /** tambahan delay per karakter text/caption (default 0) */
    perCharMs?: number;
    /** batas atas total delay dalam ms (default 8000) */
    maxTotal?: number;
};
export declare const normalizeHumanizeConfig: (config?: boolean | HumanizeConfig) => Required<HumanizeConfig> | null;
export declare const makeHumanizer: <T extends { sendMessage: (...args: any[]) => Promise<any> }>(sock: T, config?: boolean | HumanizeConfig) => T & { humanize?: Required<HumanizeConfig> };
