import { isLocalhost } from '../utils/host.js';

describe('Host Utils', () => {
    it('should return true on localhost', () => {
        expect(isLocalhost('localhost')).toBe(true);
    });

    it('should return true on 127.0.0.1', () => {
        expect(isLocalhost('127.0.0.1')).toBe(true);
    });

    it('should return false on other domains', () => {
        expect(isLocalhost('example.com')).toBe(false);
    });
});
