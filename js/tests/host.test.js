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

    it('should return true on ::1 and 0.0.0.0', () => {
        expect(isLocalhost('::1')).toBe(true);
        expect(isLocalhost('0.0.0.0')).toBe(true);
    });

    it('should return true for .local hostnames', () => {
        expect(isLocalhost('my-mac.local')).toBe(true);
        expect(isLocalhost('printer.local')).toBe(true);
    });

    it('should return true for private IPv4 ranges', () => {
        expect(isLocalhost('10.1.2.3')).toBe(true);
        expect(isLocalhost('192.168.0.10')).toBe(true);
        expect(isLocalhost('172.16.5.5')).toBe(true);
        expect(isLocalhost('172.31.255.255')).toBe(true);
    });

    it('should return false for non-private IPv4 ranges', () => {
        expect(isLocalhost('8.8.8.8')).toBe(false);
        expect(isLocalhost('172.15.0.1')).toBe(false);
        expect(isLocalhost('172.32.0.1')).toBe(false);
    });

    it('should handle empty or undefined hostnames', () => {
        // @ts-ignore
        expect(isLocalhost(undefined)).toBe(false);
        expect(isLocalhost('')).toBe(false);
    });
});
