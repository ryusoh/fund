export function resolveBenchmarkDateKey(benchmarkReturnsMap, baseDate, isAsianMarket) {
    if (
        !(benchmarkReturnsMap instanceof Map) ||
        !(baseDate instanceof Date) ||
        Number.isNaN(baseDate.getTime())
    ) {
        return null;
    }

    const offsets = isAsianMarket ? [-1, -2, -3, -4, 0, 1] : [0];

    for (let i = 0; i < offsets.length; i += 1) {
        const offset = offsets[i];
        const candidate = new Date(baseDate.getTime());
        candidate.setUTCDate(candidate.getUTCDate() + offset);
        const key = candidate.toISOString().slice(0, 10);
        if (benchmarkReturnsMap.has(key)) {
            return key;
        }
    }

    return null;
}
