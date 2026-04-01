const LOCALHOST_DOMAINS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

const isPrivateIPv4 = (hostname) => {
    const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!ipv4) {
        return false;
    }
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
};

export const isLocalhost = (hostname) => {
    if (!hostname) {
        return false;
    }

    // Common loopback / dev hostnames
    if (LOCALHOST_DOMAINS.has(hostname)) {
        return true;
    }

    // .local domains commonly used on LAN
    if (hostname.endsWith('.local')) {
        return true;
    }

    // Private IPv4 ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
    return isPrivateIPv4(hostname);
};
