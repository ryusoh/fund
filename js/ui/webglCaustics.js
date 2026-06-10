import {
    OrthographicCamera,
    PlaneGeometry,
    Scene,
    ShaderMaterial,
    WebGLRenderer,
    Mesh,
    Clock,
    WebGLRenderTarget,
    HalfFloatType,
    NearestFilter,
    LinearFilter,
    RGBAFormat,
    Vector2,
    CanvasTexture,
} from '../vendor/three.module.js';

// --- GLSL SHADERS ---

const BASE_VERTEX = `
varying vec2 vUv;
void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position, 1.0);
}
`;

const BOUNDARY_LOGIC = `
uniform sampler2D u_obstacles;
float isSolid(vec2 uv) {
    return texture2D(u_obstacles, uv).r;
}
`;

const ADVECTION_SHADER = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform float dt;
uniform float dissipation;
${BOUNDARY_LOGIC}
void main() {
    if (isSolid(vUv) > 0.5) {
        gl_FragColor = vec4(0.0);
        return;
    }
    vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
    gl_FragColor = texture2D(uSource, coord) * dissipation;
}
`;

const DIVERGENCE_SHADER = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform vec2 texelSize;
${BOUNDARY_LOGIC}
void main() {
    float L = texture2D(uVelocity, vUv - vec2(texelSize.x, 0.0)).x;
    float R = texture2D(uVelocity, vUv + vec2(texelSize.x, 0.0)).x;
    float T = texture2D(uVelocity, vUv + vec2(0.0, texelSize.y)).y;
    float B = texture2D(uVelocity, vUv - vec2(0.0, texelSize.y)).y;

    if (isSolid(vUv - vec2(texelSize.x, 0.0)) > 0.5) L = 0.0;
    if (isSolid(vUv + vec2(texelSize.x, 0.0)) > 0.5) R = 0.0;
    if (isSolid(vUv + vec2(0.0, texelSize.y)) > 0.5) T = 0.0;
    if (isSolid(vUv - vec2(0.0, texelSize.y)) > 0.5) B = 0.0;

    float div = 0.5 * ((R - L) + (T - B));
    gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
}
`;

const JACOBI_SHADER = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 texelSize;
${BOUNDARY_LOGIC}
void main() {
    float L = texture2D(uPressure, vUv - vec2(texelSize.x, 0.0)).x;
    float R = texture2D(uPressure, vUv + vec2(texelSize.x, 0.0)).x;
    float T = texture2D(uPressure, vUv + vec2(0.0, texelSize.y)).x;
    float B = texture2D(uPressure, vUv - vec2(0.0, texelSize.y)).x;
    float pC = texture2D(uPressure, vUv).x;

    if (isSolid(vUv - vec2(texelSize.x, 0.0)) > 0.5) L = pC;
    if (isSolid(vUv + vec2(texelSize.x, 0.0)) > 0.5) R = pC;
    if (isSolid(vUv + vec2(0.0, texelSize.y)) > 0.5) T = pC;
    if (isSolid(vUv - vec2(0.0, texelSize.y)) > 0.5) B = pC;

    float div = texture2D(uDivergence, vUv).x;
    float pNew = (L + R + B + T - div) * 0.25;
    gl_FragColor = vec4(pNew, 0.0, 0.0, 1.0);
}
`;

const GRADIENT_SUBTRACT_SHADER = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 texelSize;
${BOUNDARY_LOGIC}
void main() {
    if (isSolid(vUv) > 0.5) {
        gl_FragColor = vec4(0.0);
        return;
    }
    float L = texture2D(uPressure, vUv - vec2(texelSize.x, 0.0)).x;
    float R = texture2D(uPressure, vUv + vec2(texelSize.x, 0.0)).x;
    float T = texture2D(uPressure, vUv + vec2(0.0, texelSize.y)).x;
    float B = texture2D(uPressure, vUv - vec2(0.0, texelSize.y)).x;
    float pC = texture2D(uPressure, vUv).x;

    if (isSolid(vUv - vec2(texelSize.x, 0.0)) > 0.5) L = pC;
    if (isSolid(vUv + vec2(texelSize.x, 0.0)) > 0.5) R = pC;
    if (isSolid(vUv + vec2(0.0, texelSize.y)) > 0.5) T = pC;
    if (isSolid(vUv - vec2(0.0, texelSize.y)) > 0.5) B = pC;

    vec2 oldV = texture2D(uVelocity, vUv).xy;
    vec2 grad = vec2(R - L, T - B) * 0.5;
    gl_FragColor = vec4(oldV - grad, 0.0, 1.0);
}
`;

const SPLAT_SHADER = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
${BOUNDARY_LOGIC}
void main() {
    if (isSolid(vUv) > 0.5) {
        gl_FragColor = vec4(0.0);
        return;
    }
    vec2 p = vUv - point;
    p.x *= aspectRatio;
    vec3 splat = exp(-dot(p, p) / radius) * color;
    vec3 base = texture2D(uTarget, vUv).xyz;
    gl_FragColor = vec4(base + splat, 1.0);
}
`;

const DISPLAY_SHADER = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uDye;
uniform sampler2D uVelocity;
uniform sampler2D u_obstacles;
uniform float u_time;

#define TWO_PI 6.28318530718

vec3 cieXYZ(float lambda) {
    float x1 = exp(-0.5 * pow((lambda - 442.0) * ((lambda < 442.0) ? 0.0624 : 0.0374), 2.0));
    float x2 = exp(-0.5 * pow((lambda - 599.8) * ((lambda < 599.8) ? 0.0264 : 0.0323), 2.0));
    float x3 = exp(-0.5 * pow((lambda - 501.1) * ((lambda < 501.1) ? 0.0490 : 0.0382), 2.0));
    float x = 0.362 * x1 + 1.056 * x2 - 0.065 * x3;
    float y1 = exp(-0.5 * pow((lambda - 568.8) * ((lambda < 568.8) ? 0.0213 : 0.0247), 2.0));
    float y2 = exp(-0.5 * pow((lambda - 530.9) * ((lambda < 530.9) ? 0.0613 : 0.0322), 2.0));
    float y = 0.821 * y1 + 0.286 * y2;
    float z1 = exp(-0.5 * pow((lambda - 437.0) * ((lambda < 437.0) ? 0.0845 : 0.0278), 2.0));
    float z2 = exp(-0.5 * pow((lambda - 459.0) * ((lambda < 459.0) ? 0.0385 : 0.0725), 2.0));
    float z = 1.217 * z1 + 0.681 * z2;
    return vec3(x, y, z);
}

vec3 xyzToSRGB(vec3 xyz) {
    return vec3(
        dot(xyz, vec3( 3.2406, -1.5372, -0.4986)),
        dot(xyz, vec3(-0.9689,  1.8758,  0.0415)),
        dot(xyz, vec3( 0.0557, -0.2040,  1.0570))
    );
}

vec3 thinFilmColor(float opd) {
    vec3 xyz = vec3(0.0);
    float ySum = 0.0;
    float phase, refl;
    vec3 cmf;
    #define FILM_SAMPLE(LAMBDA) \\
        phase = TWO_PI * opd / LAMBDA; \\
        refl = sin(phase * 0.5); refl = refl * refl; \\
        cmf = cieXYZ(LAMBDA); \\
        xyz += cmf * refl; \\
        ySum += cmf.y;

    FILM_SAMPLE(390.0) FILM_SAMPLE(406.0) FILM_SAMPLE(422.0) FILM_SAMPLE(438.0)
    FILM_SAMPLE(454.0) FILM_SAMPLE(470.0) FILM_SAMPLE(486.0) FILM_SAMPLE(502.0)
    FILM_SAMPLE(518.0) FILM_SAMPLE(534.0) FILM_SAMPLE(550.0) FILM_SAMPLE(566.0)
    FILM_SAMPLE(582.0) FILM_SAMPLE(598.0) FILM_SAMPLE(614.0) FILM_SAMPLE(630.0)
    FILM_SAMPLE(646.0) FILM_SAMPLE(662.0) FILM_SAMPLE(678.0) FILM_SAMPLE(694.0)

    xyz /= max(ySum, 0.001);
    xyz *= 2.8;
    vec3 rgb = xyzToSRGB(xyz);
    rgb = rgb / (rgb + vec3(1.0));
    rgb *= 1.8;
    return clamp(rgb, vec3(0.0), vec3(1.0));
}

void main() {
    float isObstacle = texture2D(u_obstacles, vUv).r;
    if (isObstacle > 0.5) {
        // Subtle outline around obstacles
        gl_FragColor = vec4(0.0);
        return;
    }

    vec3 dye = texture2D(uDye, vUv).rgb;
    vec2 vel = texture2D(uVelocity, vUv).xy;

    float density = min(length(dye), 2.0);
    float speed = min(length(vel), 5.0);

    // Map fluid density to thin film thickness (300-500nm range)
    float opd = 300.0 + density * 150.0 + speed * 20.0;

    vec3 iridescence = thinFilmColor(opd);

    // Specular highlight from fluid wave peaks
    float specular = pow(density / 2.0, 3.0) * 1.5;

    vec3 color = iridescence * (density + 0.1) + vec3(specular);

    float alpha = clamp((color.r + color.g + color.b) / 3.0, 0.0, 1.0) * 0.85;

    gl_FragColor = vec4(color, alpha);
}
`;

const canUseWebGL = () => {
    if (typeof window === 'undefined' || !window.WebGLRenderingContext) {
        return false;
    }
    try {
        const canvas = document.createElement('canvas');
        return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
    } catch {
        return false;
    }
};

class FBO {
    constructor(w, h, type, format, internalFormat, filter) {
        this.texture = new WebGLRenderTarget(w, h, {
            type,
            format,
            internalFormat,
            minFilter: filter,
            magFilter: filter,
            depthBuffer: false,
            stencilBuffer: false,
        });
    }
}

class DoubleFBO {
    constructor(w, h, type, format, internalFormat, filter) {
        this.read = new FBO(w, h, type, format, internalFormat, filter).texture;
        this.write = new FBO(w, h, type, format, internalFormat, filter).texture;
    }
    swap() {
        const temp = this.read;
        this.read = this.write;
        this.write = temp;
    }
}

export class WebGLCaustics {
    constructor(element, options = {}) {
        this.element = element;
        this.options = {
            mixBlendMode: 'screen',
            opacity: 0.6,
            simResolution: 128,
            dyeResolution: 512,
            ...options,
        };

        this.enabled = canUseWebGL();
        if (!this.enabled) {
            return;
        }

        this.motionQuery =
            typeof window.matchMedia === 'function'
                ? window.matchMedia('(prefers-reduced-motion: reduce)')
                : null;
        if (this.motionQuery && this.motionQuery.matches) {
            this.enabled = false;
            return;
        }

        this.container = document.createElement('div');
        this.container.className = 'webgl-caustics-layer';
        Object.assign(this.container.style, {
            position: 'absolute',
            inset: '-1px',
            zIndex: '-1',
            pointerEvents: 'none',
            overflow: 'hidden',
            mixBlendMode: this.options.mixBlendMode,
            opacity: '0',
            transition: 'opacity 1s ease',
            borderRadius: 'inherit',
        });

        if (this.element.firstChild) {
            this.element.insertBefore(this.container, this.element.firstChild);
        } else {
            this.element.appendChild(this.container);
        }

        this.renderer = new WebGLRenderer({ antialias: false, alpha: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        Object.assign(this.renderer.domElement.style, {
            width: '100%',
            height: '100%',
            display: 'block',
        });
        this.container.appendChild(this.renderer.domElement);

        this.scene = new Scene();
        this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.geometry = new PlaneGeometry(2, 2);

        this.clock = new Clock();
        this.isRunning = false;

        this.ext = this.renderer.capabilities.isWebGL2
            ? this.renderer.extensions.get('EXT_color_buffer_float')
            : this.renderer.extensions.get('OES_texture_half_float');

        this.initFBOs();
        this.initShaders();

        // Canvas for obstacle mapping
        this.obstacleCanvas = document.createElement('canvas');
        this.obstacleCtx = this.obstacleCanvas.getContext('2d');
        this.obstacleTexture = new CanvasTexture(this.obstacleCanvas);

        this.resizeObserver = new window.ResizeObserver(() => {
            this.resize();
            this.updateObstacleMap();
        });
        this.resizeObserver.observe(this.container);

        // Periodically update obstacle map in case calendar renders late
        this.obstacleTimer = setInterval(() => this.updateObstacleMap(), 1000);

        // Interaction
        this.pointer = {
            down: false,
            x: 0,
            y: 0,
            moved: false,
            dx: 0,
            dy: 0,
        };

        const onPointerMove = (e) => {
            const rect = this.container.getBoundingClientRect();
            // Convert to 0-1 UV coordinates
            const x = (e.clientX - rect.left) / rect.width;
            const y = 1.0 - (e.clientY - rect.top) / rect.height; // Flip Y for WebGL

            this.pointer.dx = x - this.pointer.x;
            this.pointer.dy = y - this.pointer.y;
            this.pointer.x = x;
            this.pointer.y = y;
            this.pointer.moved = true;
        };

        this.element.addEventListener('pointermove', onPointerMove, { passive: true });
        this.cleanupPointer = () => {
            this.element.removeEventListener('pointermove', onPointerMove);
        };

        this.resize();
    }

    initFBOs() {
        const simRes = this.options.simResolution;
        const dyeRes = this.options.dyeResolution;
        const type = HalfFloatType;

        this.velocity = new DoubleFBO(simRes, simRes, type, RGBAFormat, RGBAFormat, LinearFilter);
        this.density = new DoubleFBO(dyeRes, dyeRes, type, RGBAFormat, RGBAFormat, LinearFilter);
        this.divergence = new FBO(
            simRes,
            simRes,
            type,
            RGBAFormat,
            RGBAFormat,
            NearestFilter
        ).texture;
        this.pressure = new DoubleFBO(simRes, simRes, type, RGBAFormat, RGBAFormat, NearestFilter);
    }

    createMaterial(fragmentShader, uniforms) {
        return new ShaderMaterial({
            vertexShader: BASE_VERTEX,
            fragmentShader,
            uniforms,
            depthTest: false,
            depthWrite: false,
        });
    }

    initShaders() {
        this.obstacleTexture = new CanvasTexture(document.createElement('canvas'));

        this.advectionMat = this.createMaterial(ADVECTION_SHADER, {
            uVelocity: { value: null },
            uSource: { value: null },
            u_obstacles: { value: this.obstacleTexture },
            texelSize: { value: new Vector2() },
            dt: { value: 0.016 },
            dissipation: { value: 0.99 },
        });

        this.divergenceMat = this.createMaterial(DIVERGENCE_SHADER, {
            uVelocity: { value: null },
            u_obstacles: { value: this.obstacleTexture },
            texelSize: { value: new Vector2() },
        });

        this.jacobiMat = this.createMaterial(JACOBI_SHADER, {
            uPressure: { value: null },
            uDivergence: { value: null },
            u_obstacles: { value: this.obstacleTexture },
            texelSize: { value: new Vector2() },
        });

        this.gradientMat = this.createMaterial(GRADIENT_SUBTRACT_SHADER, {
            uPressure: { value: null },
            uVelocity: { value: null },
            u_obstacles: { value: this.obstacleTexture },
            texelSize: { value: new Vector2() },
        });

        this.splatMat = this.createMaterial(SPLAT_SHADER, {
            uTarget: { value: null },
            u_obstacles: { value: this.obstacleTexture },
            aspectRatio: { value: 1 },
            color: { value: null },
            point: { value: null },
            radius: { value: 0.0 },
        });

        this.displayMat = this.createMaterial(DISPLAY_SHADER, {
            uDye: { value: null },
            uVelocity: { value: null },
            u_obstacles: { value: this.obstacleTexture },
            u_time: { value: 0 },
        });

        this.mesh = new Mesh(this.geometry, this.displayMat);
        this.scene.add(this.mesh);
    }

    updateObstacleMap() {
        if (!this.container) {
            return;
        }

        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        if (width === 0 || height === 0) {
            return;
        }

        this.obstacleCanvas.width = width;
        this.obstacleCanvas.height = height;

        this.obstacleCtx.fillStyle = 'black'; // Fluid
        this.obstacleCtx.fillRect(0, 0, width, height);

        this.obstacleCtx.fillStyle = 'white'; // Solid obstacles

        // Find calendar cells relative to the element
        const rect = this.element.getBoundingClientRect();
        const cells = this.element.querySelectorAll('.ch-day, rect, .cal-nav-btn');
        cells.forEach((cell) => {
            const cRect = cell.getBoundingClientRect();
            // Calculate relative position
            const x = cRect.left - rect.left;
            const y = cRect.top - rect.top;

            // Draw slightly larger to ensure good boundary
            this.obstacleCtx.fillRect(x - 2, y - 2, cRect.width + 4, cRect.height + 4);
        });

        this.obstacleTexture.needsUpdate = true;

        // Update all materials to use the fresh texture
        [
            this.advectionMat,
            this.divergenceMat,
            this.jacobiMat,
            this.gradientMat,
            this.splatMat,
            this.displayMat,
        ].forEach((mat) => {
            mat.uniforms.u_obstacles.value = this.obstacleTexture;
        });
    }

    resize() {
        if (!this.enabled || !this.container) {
            return;
        }
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        if (width === 0 || height === 0) {
            return;
        }

        this.renderer.setSize(width, height);
        this.aspectRatio = width / height;

        const simTexel = new Vector2(
            1 / this.options.simResolution,
            1 / this.options.simResolution
        );
        this.advectionMat.uniforms.texelSize.value = simTexel;
        this.divergenceMat.uniforms.texelSize.value = simTexel;
        this.jacobiMat.uniforms.texelSize.value = simTexel;
        this.gradientMat.uniforms.texelSize.value = simTexel;
    }

    renderTarget(material, target) {
        this.mesh.material = material;
        this.renderer.setRenderTarget(target);
        this.renderer.render(this.scene, this.camera);
        this.renderer.setRenderTarget(null);
    }

    splat(point, dx, dy, color) {
        // Velocity
        this.splatMat.uniforms.uTarget.value = this.velocity.read.texture;
        this.splatMat.uniforms.aspectRatio.value = this.aspectRatio;
        this.splatMat.uniforms.point.value = point;
        this.splatMat.uniforms.color.value = [dx, dy, 0];
        this.splatMat.uniforms.radius.value = 0.005;
        this.renderTarget(this.splatMat, this.velocity.write);
        this.velocity.swap();

        // Density
        this.splatMat.uniforms.uTarget.value = this.density.read.texture;
        this.splatMat.uniforms.color.value = color;
        this.splatMat.uniforms.radius.value = 0.005;
        this.renderTarget(this.splatMat, this.density.write);
        this.density.swap();
    }

    step() {
        const dt = Math.min(this.clock.getDelta(), 0.03); // Cap dt

        // 1. Pointer interaction
        if (this.pointer.moved) {
            // Apply a strong velocity force along the pointer movement
            const velocityGain = 300.0;
            const dyeGain = 0.8;
            this.splat(
                new Vector2(this.pointer.x, this.pointer.y),
                this.pointer.dx * velocityGain,
                this.pointer.dy * velocityGain,
                [0.1 * dyeGain, 0.4 * dyeGain, 1.0 * dyeGain]
            );
            this.pointer.moved = false;
        }

        // 2. Continuous flow (ambient wind from left to right)
        // Splat continuously on the left side to simulate river
        const yPoint = 0.5 + Math.sin(this.clock.elapsedTime * 2.0) * 0.3;
        this.splat(new Vector2(0.1, yPoint), 10.0, 0.0, [0.1, 0.1, 0.1]);

        // 2. Advect Velocity
        this.advectionMat.uniforms.uVelocity.value = this.velocity.read.texture;
        this.advectionMat.uniforms.uSource.value = this.velocity.read.texture;
        this.advectionMat.uniforms.dt.value = dt;
        this.advectionMat.uniforms.dissipation.value = 0.98;
        this.renderTarget(this.advectionMat, this.velocity.write);
        this.velocity.swap();

        // 3. Advect Density
        this.advectionMat.uniforms.uVelocity.value = this.velocity.read.texture;
        this.advectionMat.uniforms.uSource.value = this.density.read.texture;
        this.advectionMat.uniforms.dissipation.value = 0.97;
        this.renderTarget(this.advectionMat, this.density.write);
        this.density.swap();

        // 4. Divergence
        this.divergenceMat.uniforms.uVelocity.value = this.velocity.read.texture;
        this.renderTarget(this.divergenceMat, this.divergence);

        // 5. Clear Pressure
        this.renderer.setRenderTarget(this.pressure.read);
        this.renderer.clear();

        // 6. Solve Pressure (Jacobi)
        this.jacobiMat.uniforms.uDivergence.value = this.divergence.texture;
        for (let i = 0; i < 20; i++) {
            this.jacobiMat.uniforms.uPressure.value = this.pressure.read.texture;
            this.renderTarget(this.jacobiMat, this.pressure.write);
            this.pressure.swap();
        }

        // 7. Gradient Subtraction
        this.gradientMat.uniforms.uPressure.value = this.pressure.read.texture;
        this.gradientMat.uniforms.uVelocity.value = this.velocity.read.texture;
        this.renderTarget(this.gradientMat, this.velocity.write);
        this.velocity.swap();

        // 8. Display
        this.displayMat.uniforms.uDye.value = this.density.read.texture;
        this.displayMat.uniforms.uVelocity.value = this.velocity.read.texture;
        this.displayMat.uniforms.u_time.value = this.clock.elapsedTime;

        this.mesh.material = this.displayMat;
        this.renderer.render(this.scene, this.camera);
    }

    start() {
        if (!this.enabled || this.isRunning) {
            return;
        }
        this.isRunning = true;
        this.clock.start();
        this.container.style.opacity = this.options.opacity.toString();

        const renderLoop = () => {
            if (!this.isRunning) {
                return;
            }
            this.step();
            this.animationFrameId = requestAnimationFrame(renderLoop);
        };
        renderLoop();
    }

    stop() {
        if (!this.isRunning) {
            return;
        }
        this.isRunning = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        if (this.container) {
            this.container.style.opacity = '0';
        }
    }

    dispose() {
        if (!this.enabled) {
            return;
        }
        this.stop();
        this.enabled = false;
        if (this.cleanupPointer) {
            this.cleanupPointer();
        }
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        if (this.obstacleTimer) {
            clearInterval(this.obstacleTimer);
        }
        this.geometry.dispose();
        this.renderer.dispose();
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}
