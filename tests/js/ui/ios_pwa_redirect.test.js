/* global __dirname */
import fs from 'fs';
import path from 'path';
import { runInNewContext } from 'vm';

const html = fs.readFileSync(path.resolve(__dirname, '../../../index.html'), 'utf8');
const redirectScript = html.match(/<script id="ios-pwa-redirect">([\s\S]*?)<\/script>/)?.[1];

function runRedirect(standalone) {
    const replace = jest.fn();
    runInNewContext(redirectScript, {
        window: {
            navigator: { standalone },
            location: { replace },
        },
    });
    return replace;
}

describe('iOS PWA homepage redirect', () => {
    test('opens Position in iOS standalone mode', () => {
        expect(redirectScript).toBeDefined();
        expect(runRedirect(true)).toHaveBeenCalledWith('./position/');
    });

    test.each([false, undefined])('does not redirect when standalone is %s', (standalone) => {
        expect(runRedirect(standalone)).not.toHaveBeenCalled();
    });
});
