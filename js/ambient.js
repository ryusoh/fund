// Ambient canvas enhancement using Sketch.js (Fund)
(function () {
    try {
        const usp =
            typeof window.URLSearchParams !== 'undefined'
                ? new window.URLSearchParams(window.location.search || '')
                : null;
        const force = usp ? usp.get('ambient') : null; // 'on' | 'debug'

        const C = Object.assign(
            {
                enabled: true,
                minWidth: 1024,
                maxParticles: 120,
                densityDivisor: 25000,
                radius: { min: 4.0, max: 8.0 },
                alpha: { min: 0.2, max: 0.4 },
                speed: 0.2,
                zIndex: 1,
                blend: 'screen',
            },
            window.AMBIENT_CONFIG || {}
        );

        const m = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
        const reduce = m && m.matches;
        const large = window.innerWidth >= C.minWidth;
        const enabled = C.enabled || !!force;
        if ((!enabled || reduce) && !force) {return;}
        if (!large && !force) {return;}
        if (!window.Sketch) {return;}

        const s = window.Sketch.create({
            container: document.body,
            retina: true,
            interval: 2,
            globals: false,
            autopause: true,
        });

        s.canvas.className += ' ambient-canvas';
        s.canvas.style.position = 'fixed';
        s.canvas.style.top = '0';
        s.canvas.style.left = '0';
        s.canvas.style.pointerEvents = 'none';
        s.canvas.style.zIndex = String(C.zIndex);

        const MAX = C.maxParticles;
        const particles = [];

        function reset(p) {
            p.x = Math.random() * s.width;
            p.y = Math.random() * s.height;
            p.vx = (Math.random() - 0.5) * C.speed;
            p.vy = (Math.random() - 0.5) * C.speed;
            p.r = C.radius.min + Math.random() * (C.radius.max - C.radius.min);
            p.a = C.alpha.min + Math.random() * (C.alpha.max - C.alpha.min);
            return p;
        }

        s.setup = function () {
            particles.length = 0;
            const divisor = C.densityDivisor;
            const count = Math.min(MAX, Math.round((s.width * s.height) / divisor));
            for (let i = 0; i < count; i++) {particles.push(reset({}));}
        };

        s.resize = function () {
            s.setup();
        };

        s.update = function () {
            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                p.x += p.vx;
                p.y += p.vy;
                if (p.x < -10 || p.x > s.width + 10 || p.y < -10 || p.y > s.height + 10) {reset(p);}
            }
        };

        s.draw = function () {
            const ctx = this;
            ctx.save();
            ctx.globalCompositeOperation = C.blend;
            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2, false);
                ctx.fillStyle = 'rgba(255,255,255,' + p.a + ')';
                ctx.fill();
            }
            ctx.restore();
        };
    } catch {}
})();
