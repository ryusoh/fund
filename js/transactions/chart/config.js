export const PERFORMANCE_SERIES_CURRENCY = {
    '^LZ': 'USD',
    '^DJI': 'USD',
    '^GSPC': 'USD',
    '^IXIC': 'USD',
    '^HSI': 'USD', // treat HKD as USD due to peg
    '^N225': 'JPY',
    '^SSEC': 'CNY',
};

export const FX_CURRENCY_ORDER = ['USD', 'CNY', 'JPY', 'KRW'];

export const FX_LINE_COLORS = {
    USD: '#FF8E53',
    CNY: '#ff4d4d',
    JPY: '#64b5f6',
    KRW: '#ffef2f',
};

export const FX_GRADIENTS = {
    USD: ['#CC4E1F', '#FF9A62'],
    CNY: ['#7A0B0B', '#FF4D4D'],
    JPY: ['#0d3b66', '#64b5f6'],
    KRW: ['#fb8500', '#ffef2f'],
};

export const BENCHMARK_GRADIENTS = {
    '^LZ': ['#fb8500', '#ffef2f'],
    '^GSPC': ['#0d3b66', '#64b5f6'],
    '^IXIC': ['#0f4c81', '#74c0fc'],
    '^DJI': ['#123c69', '#6aaefc'],
    '^SSEC': ['#0e487a', '#5da9f6'],
    '^HSI': ['#0d4977', '#7ab8ff'],
    '^N225': ['#0b3d63', '#89c2ff'],
};

export const BALANCE_GRADIENTS = {
    balance: ['#fb8500', '#ffef2f'],
    contribution: ['#0d3b66', '#64b5f6'],
};
