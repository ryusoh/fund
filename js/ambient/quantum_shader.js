// js/ambient/quantum_shader.js
// Immersive monochrome quantum harmonic oscillator playground.

const MAX_N = 8;
const POINTER_SMOOTHING = 0.08;

const factorialCache = new Map([
    [0, 1],
    [1, 1],
]);

function factorial(n) {
    if (factorialCache.has(n)) {
        return factorialCache.get(n);
    }
    let result = 1;
    for (let i = 2; i <= n; i += 1) {
        result *= i;
    }
    factorialCache.set(n, result);
    return result;
}

function normalization(n) {
    return 1 / Math.sqrt(Math.pow(2, n) * factorial(n) * Math.sqrt(Math.PI));
}

function createContainer() {
    const wrap = document.createElement('div');
    wrap.className = 'quantum-widget';
    document.body.appendChild(wrap);
    return wrap;
}

async function loadThree() {
    const module = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');
    return module;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function initControls(container, surface, state, uniforms, onStateChange) {
    document.addEventListener('keydown', (event) => {
        const target = event.target;
        const tag = target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) {
            return;
        }

        let handled = true;
        const step = event.shiftKey ? 2 : 1;
        if (event.key === 'ArrowUp') {
            state.ny = clamp(state.ny + step, 0, MAX_N);
        } else if (event.key === 'ArrowDown') {
            state.ny = clamp(state.ny - step, 0, MAX_N);
        } else if (event.key === 'ArrowRight') {
            state.nx = clamp(state.nx + step, 0, MAX_N);
        } else if (event.key === 'ArrowLeft') {
            state.nx = clamp(state.nx - step, 0, MAX_N);
        } else {
            handled = false;
        }

        if (handled) {
            event.preventDefault();
            uniforms.nx.value = state.nx;
            uniforms.ny.value = state.ny;
            uniforms.normalizationX.value = normalization(state.nx);
            uniforms.normalizationY.value = normalization(state.ny);
            uniforms.energy.value = state.nx + state.ny + 1;
            onStateChange();
        }
    });

    let pointerActive = false;
    let pointerId = null;
    let start = { x: 0, y: 0, nx: state.nx, ny: state.ny };

    const updatePointerUniform = (x, y) => {
        const rect = surface.getBoundingClientRect();
        const px = clamp((x - rect.left) / rect.width, 0, 1);
        const py = clamp((y - rect.top) / rect.height, 0, 1);
        uniforms.pointerTarget.value.set(px, 1 - py);
    };

    const onPointerDown = (event) => {
        pointerActive = true;
        pointerId = event.pointerId;
        start = {
            x: event.clientX,
            y: event.clientY,
            nx: state.nx,
            ny: state.ny,
        };
        if (typeof surface.setPointerCapture === 'function') {
            try {
                surface.setPointerCapture(pointerId);
            } catch {
                // Ignore pointer capture failures on platforms that disallow it.
            }
        }
        updatePointerUniform(event.clientX, event.clientY);
        container.classList.add('is-dragging');
    };

    const onPointerMove = (event) => {
        if (!pointerActive) {
            updatePointerUniform(event.clientX, event.clientY);
            return;
        }
        if (pointerId !== event.pointerId) {
            return;
        }

        const deltaX = (event.clientX - start.x) / 60;
        const deltaY = (event.clientY - start.y) / 60;
        const newNx = clamp(Math.round(start.nx + deltaX), 0, MAX_N);
        const newNy = clamp(Math.round(start.ny - deltaY), 0, MAX_N);

        if (newNx !== state.nx || newNy !== state.ny) {
            state.nx = newNx;
            state.ny = newNy;
            uniforms.nx.value = state.nx;
            uniforms.ny.value = state.ny;
            uniforms.normalizationX.value = normalization(state.nx);
            uniforms.normalizationY.value = normalization(state.ny);
            uniforms.energy.value = state.nx + state.ny + 1;
            onStateChange();
        }

        updatePointerUniform(event.clientX, event.clientY);
    };

    const releasePointer = (event) => {
        if (pointerId !== event.pointerId) {
            return;
        }
        pointerActive = false;
        pointerId = null;
        try {
            if (
                typeof surface.releasePointerCapture === 'function' &&
                (typeof surface.hasPointerCapture !== 'function' ||
                    surface.hasPointerCapture(event.pointerId))
            ) {
                surface.releasePointerCapture(event.pointerId);
            }
        } catch {
            // Ignore errors from releasePointerCapture on browsers without support.
        }
        container.classList.remove('is-dragging');
    };

    surface.addEventListener('pointerdown', onPointerDown);
    surface.addEventListener('pointermove', onPointerMove);
    surface.addEventListener('pointerup', releasePointer);
    surface.addEventListener('pointercancel', releasePointer);
    surface.addEventListener('pointerleave', () => {
        if (!pointerActive) {
            uniforms.pointerTarget.value.set(0.5, 0.5);
        }
    });
    surface.addEventListener('contextmenu', (event) => event.preventDefault());

    window.addEventListener(
        'blur',
        () => {
            pointerActive = false;
            container.classList.remove('is-dragging');
            uniforms.pointerTarget.value.set(0.5, 0.5);
        },
        { passive: true }
    );
}

function buildShaderMaterial(THREE, uniforms) {
    const sharedGLSL = `
        const int MAX_H_ORDER = 12;

        float hermite(float n, float x) {
            int ni = int(n + 0.5);
            if (ni <= 0) {
                return 1.0;
            }
            if (ni == 1) {
                return 2.0 * x;
            }
            float hm2 = 1.0;
            float hm1 = 2.0 * x;
            float h = hm1;
            for (int i = 2; i <= MAX_H_ORDER; i++) {
                if (i > ni) {
                    break;
                }
                h = 2.0 * x * hm1 - 2.0 * float(i - 1) * hm2;
                hm2 = hm1;
                hm1 = h;
            }
            return h;
        }

        float psi(float n, float normalization, float x) {
            float herm = hermite(n, x);
            return normalization * exp(-0.5 * x * x) * herm;
        }
    `;

    const vertexShader = `
        precision highp float;

        uniform float time;
        uniform float nx;
        uniform float ny;
        uniform float normalizationX;
        uniform float normalizationY;
        uniform vec2 pointer;
        uniform float energy;
        uniform float degeneracy;

        varying float vIntensity;
        varying float vRadial;
        varying float vRipple;
        varying vec2 vUv;

        ${sharedGLSL}

        void main() {
            vUv = uv;
            vec3 transformed = position;
            float radial = length(transformed.xy);
            float primary = psi(nx, normalizationX, transformed.x) * psi(ny, normalizationY, transformed.y);
            float motion = sin(time * 0.45 + radial * 3.6 + pointer.x * 6.28318);
            float breath = 1.4 + 0.45 * sin(time * 0.6 + energy * 0.32);
            float degeneracyBoost = 1.0 + 0.09 * degeneracy;
            float amplitude = primary * breath * degeneracyBoost;

            float r = max(radial, 0.001);
            vec2 radialDir = transformed.xy / r;
            transformed.xy += radialDir * primary * 0.12 * sin(time * 0.5 + pointer.y * 7.8);
            transformed.z += amplitude + motion * 0.22 + cos(time * 0.35 + pointer.y * 5.3 + transformed.x * 1.7) * 0.12;

            vIntensity = abs(primary);
            vRadial = radial;
            vRipple = motion;

            gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
        }
    `;

    const fragmentShader = `
        precision highp float;

        uniform float time;
        uniform vec2 pointer;
        uniform float energy;
        uniform float degeneracy;

        varying float vIntensity;
        varying float vRadial;
        varying float vRipple;
        varying vec2 vUv;

        ${sharedGLSL}

        void main() {
            float grain = sin((vUv.x + vUv.y) * 24.0 + time * 2.0) * 0.08;
            float ripple = sin(vUv.x * 48.0 + time * 1.8) * 0.06;
            float tone = vIntensity * 1.65 + vRipple * 0.22 + grain + ripple;
            float rim = 1.0 - smoothstep(0.0, 0.38, abs(vRadial - 0.55));
            float energyBloom = smoothstep(0.18, 0.72, vIntensity) * (0.35 + 0.45 * sin(time * 0.7 + pointer.y * 5.0));
            float degeneracyGlow = clamp(degeneracy * 0.06, 0.0, 0.6);

            float luminance = clamp(0.18 + tone + energyBloom + degeneracyGlow, 0.0, 1.35);
            luminance = pow(luminance, 0.95);

            vec3 color = vec3(luminance);
            color += rim * 0.14;
            color = clamp(color, 0.0, 1.0);

            float alpha = clamp(0.25 + vIntensity * 1.3 + rim * 0.28, 0.3, 0.95);
            vec2 centered = vUv * 2.0 - 1.0;
            float distance = length(centered);
            float edgeFalloff = 1.0 - smoothstep(0.68, 1.05, distance * 1.04);
            color *= edgeFalloff;
            alpha *= edgeFalloff;

            gl_FragColor = vec4(color, alpha);
        }
    `;

    return new THREE.ShaderMaterial({
        uniforms,
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
    });
}

function initRenderer(THREE, container) {
    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.classList.add('quantum-wave-canvas');
    renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(renderer.domElement);
    return renderer;
}

function initBackgroundRenderer(THREE) {
    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.classList.add('quantum-background-canvas');
    renderer.domElement.setAttribute('aria-hidden', 'true');
    document.body.appendChild(renderer.domElement);
    return renderer;
}

function createScene(THREE, uniforms) {
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0.4, 0.9, 6.2);

    const geometry = new THREE.PlaneGeometry(4.2, 4.2, 220, 220);
    const material = buildShaderMaterial(THREE, uniforms);
    const wave = new THREE.Mesh(geometry, material);
    wave.rotation.x = -0.22;

    const waveGroup = new THREE.Group();
    waveGroup.add(wave);
    scene.add(waveGroup);

    const ringGeometry = new THREE.RingGeometry(1.45, 1.92, 192);
    const ringMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: uniforms.time,
            pointer: uniforms.pointer,
        },
        vertexShader: `
            precision highp float;
            uniform float time;
            varying vec2 vUv;
            void main() {
                vUv = uv;
                vec3 transformed = position;
                transformed.z += 0.08 * sin(time * 0.65 + uv.x * 18.0);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
            }
        `,
        fragmentShader: `
            precision highp float;
            uniform float time;
            uniform vec2 pointer;
            varying vec2 vUv;
            void main() {
                vec2 centered = vUv - 0.5;
                float r = length(centered);
                float rim = abs(r - 0.5);
                float glow = 1.0 - smoothstep(0.03, 0.18, rim);
                float flicker = 0.55 + 0.35 * sin(time * 1.6 + pointer.y * 9.2);
                float stripes = 0.5 + 0.5 * sin(time * 0.8 + vUv.x * 32.0);
                float outerFade = 1.0 - smoothstep(0.72, 1.18, length(centered * 1.25));
                float intensity = glow * flicker * (0.4 + 0.4 * stripes) * outerFade;
                vec3 color = vec3(intensity);
                gl_FragColor = vec4(color, intensity * 0.42);
            }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const halo = new THREE.Mesh(ringGeometry, ringMaterial);
    halo.rotation.x = 0.4;
    halo.position.z = -0.5;
    scene.add(halo);

    return { scene, camera, waveGroup, halo };
}

function createBackgroundLayer(THREE) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120);
    camera.position.set(0, 0, 7.5);

    const particleCount = 1400;
    const positions = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 3.5 + Math.random() * 12.0;
        const height = -6 + Math.random() * 12;
        positions[i * 3 + 0] = Math.cos(angle) * radius;
        positions[i * 3 + 1] = height;
        positions[i * 3 + 2] = Math.sin(angle) * radius;
        sizes[i] = 0.04 + Math.random() * 0.16;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            pointer: { value: new THREE.Vector2(0.5, 0.5) },
        },
        vertexShader: `
            precision highp float;
            uniform float time;
            uniform vec2 pointer;
            attribute float aSize;
            varying float vAlpha;
            void main() {
                vec3 transformed = position;
                transformed.xz += normalize(position.xz + 0.001) * sin(time * 0.12 + length(position.xz) * 0.35) * 0.18;
                transformed.y += sin(time * 0.18 + pointer.y * 5.0 + position.y * 0.12) * 0.24;
                vAlpha = 0.35 + 0.45 * abs(sin(time * 0.6 + dot(position.xy, vec2(0.17, 0.13))));
                vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                gl_PointSize = aSize * 420.0 / -mvPosition.z;
            }
        `,
        fragmentShader: `
            precision highp float;
            varying float vAlpha;
            void main() {
                float dist = length(gl_PointCoord - 0.5);
                float alpha = smoothstep(0.5, 0.0, dist) * vAlpha;
                gl_FragColor = vec4(vec3(1.0), alpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    return { scene, camera, particles, material };
}

function bakeOfflineFallback(container) {
    container.classList.add('is-offline');
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 320;
    canvas.className = 'quantum-offline';
    const ctx = canvas.getContext('2d');

    const drawNoise = () => {
        const imageData = ctx.createImageData(canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const value = Math.random() * 255;
            data[i] = value;
            data[i + 1] = value;
            data[i + 2] = value;
            data[i + 3] = 255;
        }
        ctx.putImageData(imageData, 0, 0);
    };

    drawNoise();
    container.appendChild(canvas);
}

function init() {
    const container = createContainer();
    const state = {
        nx: 0,
        ny: 0,
    };

    loadThree()
        .then((THREE) => {
            const uniforms = {
                time: { value: 0 },
                nx: { value: state.nx },
                ny: { value: state.ny },
                normalizationX: { value: normalization(state.nx) },
                normalizationY: { value: normalization(state.ny) },
                pointer: { value: new THREE.Vector2(0.5, 0.5) },
                pointerTarget: { value: new THREE.Vector2(0.5, 0.5) },
                energy: { value: state.nx + state.ny + 1 },
                degeneracy: { value: state.nx + state.ny + 1 },
            };

            const renderer = initRenderer(THREE, container);
            const backgroundRenderer = initBackgroundRenderer(THREE);
            const {
                scene: waveScene,
                camera: waveCamera,
                waveGroup,
                halo,
            } = createScene(THREE, uniforms);
            const {
                scene: backgroundScene,
                camera: backgroundCamera,
                particles: backgroundParticles,
                material: backgroundMaterial,
            } = createBackgroundLayer(THREE);

            const syncStateMeta = () => {
                const energy = state.nx + state.ny + 1;
                uniforms.degeneracy.value = energy;
                container.dataset.nx = String(state.nx);
                container.dataset.ny = String(state.ny);
                container.dataset.energy = String(energy);
                const glow = 0.35 + Math.min(energy, 10) * 0.045;
                container.style.setProperty('--quantum-glow', glow.toFixed(3));
            };

            initControls(container, container, state, uniforms, syncStateMeta);
            syncStateMeta();

            const nowMs =
                typeof window !== 'undefined' && window.performance
                    ? window.performance.now()
                    : Date.now();
            let lastTime = nowMs;

            const render = (now) => {
                const delta = now - lastTime;
                lastTime = now;
                const timeSeconds = now * 0.001;
                uniforms.time.value = timeSeconds;

                const currentPointer = uniforms.pointer.value;
                currentPointer.lerp(
                    uniforms.pointerTarget.value,
                    1 - Math.exp(-POINTER_SMOOTHING * delta * 0.06)
                );

                const pointerOffsetX = (currentPointer.x - 0.5) * 1.1;
                const pointerOffsetY = (currentPointer.y - 0.5) * 1.1;

                waveGroup.rotation.z = Math.sin(timeSeconds * 0.35) * 0.25 + pointerOffsetX * 0.35;
                waveGroup.rotation.x =
                    -0.24 + Math.sin(timeSeconds * 0.27) * 0.08 + pointerOffsetY * 0.18;
                waveGroup.position.x = pointerOffsetX * 0.4;
                waveGroup.position.y = pointerOffsetY * 0.35;

                halo.rotation.z = timeSeconds * 0.35;
                halo.rotation.x = 0.42 + pointerOffsetY * 0.4;
                halo.position.y = Math.sin(timeSeconds * 0.6) * 0.12;

                backgroundMaterial.uniforms.time.value = timeSeconds;
                backgroundMaterial.uniforms.pointer.value.copy(currentPointer);
                backgroundParticles.rotation.y += delta * 0.00022;
                backgroundParticles.rotation.z += delta * 0.00011;

                const orbit = timeSeconds * 0.26;
                waveCamera.position.x = Math.sin(orbit) * 1.1 + pointerOffsetX * 0.6;
                waveCamera.position.y =
                    0.75 + Math.sin(timeSeconds * 0.18) * 0.4 + pointerOffsetY * 0.5;
                waveCamera.position.z = 6.2 + Math.cos(orbit) * 0.55;
                waveCamera.lookAt(0, 0, 0);

                backgroundCamera.position.x =
                    Math.sin(timeSeconds * 0.1) * 1.6 + pointerOffsetX * 1.4;
                backgroundCamera.position.y = pointerOffsetY * 1.8;
                backgroundCamera.position.z = 7.5 + Math.cos(timeSeconds * 0.08) * 0.6;
                backgroundCamera.lookAt(0, 0, 0);

                backgroundRenderer.render(backgroundScene, backgroundCamera);
                renderer.render(waveScene, waveCamera);
                requestAnimationFrame(render);
            };

            requestAnimationFrame(render);

            const resize = () => {
                const width = window.innerWidth;
                const height = window.innerHeight;
                backgroundRenderer.setSize(width, height, false);
                backgroundCamera.aspect = width / Math.max(1, height);
                backgroundCamera.updateProjectionMatrix();

                const rect = container.getBoundingClientRect();
                const aspect = rect.width / Math.max(1, rect.height);
                renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
                waveCamera.aspect = aspect || 1;
                waveCamera.updateProjectionMatrix();
            };

            if (typeof window !== 'undefined' && typeof window.ResizeObserver === 'function') {
                const resizeObserver = new window.ResizeObserver(resize);
                resizeObserver.observe(container);
            }
            window.addEventListener('resize', resize, { passive: true });
            resize();
        })
        .catch((error) => {
            if (
                typeof window !== 'undefined' &&
                window.console &&
                typeof window.console.error === 'function'
            ) {
                window.console.error('[quantum-shader] three.js failed to load', error);
            }
            bakeOfflineFallback(container);
        });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
    init();
}
