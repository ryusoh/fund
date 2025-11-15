describe('analysis lab data loading', () => {
    const ORIGINAL_FETCH = global.fetch;
    const FLAG = '__SKIP_ANALYSIS_AUTO_INIT__';

    beforeEach(() => {
        jest.resetModules();
        delete global[FLAG];
        global.fetch = ORIGINAL_FETCH;
    });

    afterEach(() => {
        jest.restoreAllMocks();
        jest.resetModules();
        delete global[FLAG];
        global.fetch = ORIGINAL_FETCH;
    });

    it('adds a cache-busting query param and disables caching for data fetches', async () => {
        const cacheBustValue = '1731900000000';
        jest.spyOn(Date, 'now').mockReturnValue(Number(cacheBustValue));
        const json = jest.fn().mockResolvedValue({ ok: true });
        const fetchMock = jest.fn().mockResolvedValue({ ok: true, json });
        global.fetch = fetchMock;
        global[FLAG] = true;

        const { fetchJson } = await import('@pages/analysis/lab.js');
        await fetchJson('../data/analysis/ANET.json');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [requestedUrl, options] = fetchMock.mock.calls[0];
        expect(requestedUrl).toContain(`?v=${cacheBustValue}`);
        expect(options).toEqual({ cache: 'no-store' });
        expect(json).toHaveBeenCalled();
    });
});
