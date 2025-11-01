// Ambient background effect (shared library)
// Expects window.Sketch and optional window.AMBIENT_CONFIG
(function () {
    try {
        const usp =
            typeof window.URLSearchParams !== 'undefined'
                ? new window.URLSearchParams(window.location.search || '')
                : null;
        const force = usp ? usp.get('ambient') : null; // 'on' | 'debug' | 'trace'
        const trace = force === 'trace';
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
        if (force === 'debug' || trace) {
            C.zIndex = 999;
            C.radius = { min: C.radius.min * 2, max: C.radius.max * 2 };
            C.alpha = { min: Math.min(0.4, C.alpha.min * 2), max: Math.min(0.8, C.alpha.max * 2) };
            C.speed = Math.max(C.speed, 0.3);
            C.densityDivisor = Math.max(15000, C.densityDivisor - 10000);
        }
        const m = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
        const reduce = m && m.matches;
        const large = window.innerWidth >= C.minWidth;
        const enabled = C.enabled || !!force;
        if ((!enabled || (reduce && C.respectReducedMotion !== false)) && !force) {
            return;
        }
        if (!large && !force) {
            return;
        }
        if (!window.Sketch) {
            return;
        }
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
        // Ensure it spans the viewport regardless of resize timing
        s.canvas.style.width = '100vw';
        s.canvas.style.height = '100vh';
        if (trace) {
            s.canvas.style.background = 'rgba(255,0,0,0.06)';
        }
        // Utilities to consistently derive canvas size in CSS pixels, regardless of retina
        function metrics() {
            const ratio = window.devicePixelRatio || 1;
            const cw = s.canvas && s.canvas.clientWidth ? s.canvas.clientWidth : window.innerWidth;
            const ch =
                s.canvas && s.canvas.clientHeight ? s.canvas.clientHeight : window.innerHeight;
            const pw = s.canvas && s.canvas.width ? s.canvas.width : cw * ratio;
            const ph = s.canvas && s.canvas.height ? s.canvas.height : ch * ratio;
            const width = pw / ratio;
            const height = ph / ratio;
            // Also reflect onto the Sketch context for downstream consumers
            s.width = width;
            s.height = height;
            return { width: width, height: height, cw: cw, ch: ch, ratio: ratio };
        }

        const MAX = C.maxParticles,
            particles = [];
        function reset(p) {
            const m = metrics();
            p.x = Math.random() * m.width;
            p.y = Math.random() * m.height;
            p.vx = (Math.random() - 0.5) * C.speed;
            p.vy = (Math.random() - 0.5) * C.speed;
            p.r = C.radius.min + Math.random() * (C.radius.max - C.radius.min);
            p.a = C.alpha.min + Math.random() * (C.alpha.max - C.alpha.min);
            return p;
        }
        s.setup = function () {
            particles.length = 0;
            const divisor = C.densityDivisor;
            // Use computed metrics to avoid undefined width/height from Sketch
            const m = metrics();
            const area = Math.max(1, m.width * m.height);
            let count = Math.min(MAX, Math.round(area / divisor));
            if (count < 20) {
                count = 20;
            } // ensure visibility
            for (let i = 0; i < count; i++) {
                particles.push(reset({}));
            }
            // if (trace && window.console) console.log('[ambient] setup', {count: count, area: area, w: s.width, h: s.height, cw: cw, ch: ch});
        };
        s.resize = function () {
            s.setup();
        };
        s.update = function () {
            // Keep bounds up-to-date during animation
            const w = metrics().width,
                h = s.height;
            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                p.x += p.vx;
                p.y += p.vy;
                if (p.x < -10 || p.x > w + 10 || p.y < -10 || p.y > h + 10) {
                    reset(p);
                }
            }
        };
        s.draw = function () {
            const ctx = this;
            ctx.save();
            ctx.globalCompositeOperation = C.blend;
            if (particles.length === 0 && trace) {
                ctx.globalCompositeOperation = 'source-over';
                ctx.fillStyle = 'rgba(0,128,255,0.12)';
                ctx.fillRect(0, 0, this.width, this.height);
            }
            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2, false);
                ctx.fillStyle = 'rgba(255,255,255,' + p.a + ')';
                ctx.fill();
            }
            ctx.restore();
        };
        // if (trace && window.console) {
        //   var m0 = (typeof metrics === 'function') ? metrics() : { width: s.width, height: s.height };
        //   console.log('[ambient] created', { C: C, size: { w: m0.width, h: m0.height }, dpi: window.devicePixelRatio||1 });
        //   window.__ambient = { config: C, instance: s };
        // eslint-disable-next-line no-unused-vars
    } catch (e) {
        /* if (window.console) console.warn('[ambient] error', ignoredError); */
    }
})();
