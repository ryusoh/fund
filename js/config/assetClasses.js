export const ASSET_CLASS_OVERRIDES = {
    // Broad market ETFs / funds
    VT: 'etf',
    VTI: 'etf',
    VOO: 'etf',
    VTSAX: 'etf',
    VYM: 'etf',
    VEA: 'etf',
    VWO: 'etf',
    VDC: 'etf',
    ICLN: 'etf',
    REK: 'etf',
    IGV: 'etf',
    VGT: 'etf',
    IHF: 'etf',
    XLK: 'etf',
    XLF: 'etf',
    PSQ: 'etf',

    // Popular ETFs
    QQQ: 'etf',
    SPY: 'etf',
    DIA: 'etf',
    SCHD: 'etf',
    SCHX: 'etf',
    SCHF: 'etf',
    JEPI: 'etf',
    GLD: 'etf',
    RWM: 'etf',
    SOXL: 'etf',
    SH: 'etf',
    SJB: 'etf',
    BUG: 'etf',
    PTLC: 'etf',
    ARKK: 'etf',
    ARKW: 'etf',

    // Fixed income ETFs
    BNDW: 'etf',
    AGG: 'etf',
    LQD: 'etf',
    TLT: 'etf',
    BOXX: 'etf',
    IEMG: 'etf',

    // International ETFs / funds
    EFA: 'etf',
    EEM: 'etf',
    IXUS: 'etf',
    ASHR: 'etf',

    // Fidelity & Vanguard mutual funds
    FXAIX: 'etf',
    FZROX: 'etf',
    FZILX: 'etf',
    FNILX: 'etf',
    FNSFX: 'etf',
    FSGGX: 'etf',
    FSKAX: 'etf',
    VFIAX: 'etf',
    VTSAX: 'etf',
    VBTLX: 'etf',
    VTIAX: 'etf',
    VFFSX: 'etf',
    VEMRX: 'etf',
    VIEIX: 'etf',
    VTMGX: 'etf',
    VGSNX: 'etf',
};

export function isLikelyFundTicker(ticker) {
    if (typeof ticker !== 'string') {
        return false;
    }
    const normalized = ticker.trim().toUpperCase();
    if (!normalized) {
        return false;
    }
    if (ASSET_CLASS_OVERRIDES[normalized]) {
        return true;
    }
    // Many US mutual funds end with X (e.g., VTSAX, FNSFX, VGSNX)
    if (normalized.length >= 4 && normalized.endsWith('X')) {
        return true;
    }
    return false;
}
