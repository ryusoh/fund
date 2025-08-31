// Check if we're in development environment
export const isDevelopment = () => {
    // In Node.js/test environments, use process.env
    if (typeof process !== 'undefined' && process.env) {
        return process.env.NODE_ENV !== 'production';
    }
    // In browser environments, check hostname patterns
    /* istanbul ignore else */
    if (typeof window !== 'undefined' && window.location) {
        const hostname = window.location.hostname;
        return (
            /* istanbul ignore next */ hostname === 'localhost' ||
            /* istanbul ignore next */
            hostname === '127.0.0.1' ||
            hostname.includes('dev') ||
            /* istanbul ignore next */
            hostname.startsWith('test') ||
            /* istanbul ignore next */
            hostname.includes('staging')
        );
    }
    // If neither process nor window is available, default to development for safety
    /* istanbul ignore next */
    return true;
};

export const logger = {
    log: (...args) => {
        if (isDevelopment()) {
            // eslint-disable-next-line no-console
            console.log(...args);
        }
    },
    warn: (...args) => {
        if (isDevelopment()) {
            // eslint-disable-next-line no-console
            console.warn(...args);
        }
    },
    error: (...args) => {
        if (isDevelopment()) {
            // eslint-disable-next-line no-console
            console.error(...args);
        }
    },
};
