import {
    OrthographicCamera,
    PlaneGeometry,
    Scene,
    ShaderMaterial,
    WebGLRenderer,
    Mesh,
    Clock,
} from '../vendor/three.module.js';

const FRAGMENT_SHADER = `
uniform float u_time;
uniform vec2 u_resolution;

// Subtle chromatic dispersion tint
const vec3 COLOR_R = vec3(0.9, 0.4, 0.5);
const vec3 COLOR_G = vec3(0.5, 0.9, 0.6);
const vec3 COLOR_B = vec3(0.4, 0.6, 0.9);

// 2D Random
vec2 random2(vec2 p) {
    return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);
}

// Voronoi distance
float voronoi(vec2 x) {
    vec2 n = floor(x);
    vec2 f = fract(x);

    float m = 8.0;
    for (int j=-1; j<=1; j++) {
        for (int i=-1; i<=1; i++) {
            vec2 g = vec2(float(i),float(j));
            vec2 o = random2(n + g);
            // Animate
            o = 0.5 + 0.5*sin(u_time * 0.5 + 6.2831*o);
            vec2 r = g + o - f;
            float d = dot(r,r);
            if(d < m) {
                m = d;
            }
        }
    }
    return sqrt(m);
}

void main() {
    vec2 st = gl_FragCoord.xy / u_resolution.xy;
    st.x *= u_resolution.x / u_resolution.y;

    // Scale the noise
    vec2 pos = st * 3.0;

    // Layered voronoi to create sharp caustic lines
    float v1 = voronoi(pos + u_time * 0.1);
    float v2 = voronoi(pos * 1.5 - u_time * 0.15);

    // Combine and invert to get the "light network" effect
    float c = v1 * 0.5 + v2 * 0.5;

    // Sharpen the peaks (caustics are highly concentrated light)
    float caustic = pow(1.0 - c, 4.0) * 1.5;

    // Add subtle chromatic aberration by offsetting the coordinates slightly for R and B
    float cR = pow(1.0 - (voronoi(pos + vec2(0.01) + u_time * 0.1) * 0.5 + v2 * 0.5), 4.0) * 1.5;
    float cB = pow(1.0 - (voronoi(pos - vec2(0.01) + u_time * 0.1) * 0.5 + v2 * 0.5), 4.0) * 1.5;

    // Base white caustic
    vec3 color = vec3(caustic);

    // Mix in subtle chromatic fringing
    color = mix(color, vec3(cR, caustic, cB), 0.3);

    // Add an overall soft glow and fade out near the edges (vignette)
    float vignette = smoothstep(1.2, 0.2, length(st - vec2(0.5 * (u_resolution.x/u_resolution.y), 0.5)));

    // Alpha controls the overall intensity of the blend
    float alpha = clamp(color.r * 0.8, 0.0, 1.0) * vignette;

    gl_FragColor = vec4(color, alpha);
}
`;

const VERTEX_SHADER = `
void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const canUseWebGL = () => {
    if (typeof window === 'undefined' || !window.WebGLRenderingContext) {
        return false;
    }
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        return !!gl;
    } catch {
        return false;
    }
};

export class WebGLCaustics {
    constructor(element, options = {}) {
        this.element = element;
        this.options = {
            mixBlendMode: 'overlay',
            opacity: 0.6,
            ...options,
        };

        this.enabled = canUseWebGL();
        if (!this.enabled) {
            return;
        }

        // Check for reduced motion
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
            inset: '-1px', // Bleed slightly to cover rounded edges seamlessly
            zIndex: '-1', // Behind content, above slab shadows
            pointerEvents: 'none',
            overflow: 'hidden',
            mixBlendMode: this.options.mixBlendMode,
            opacity: '0', // Start hidden for fade-in
            transition: 'opacity 1s ease',
            borderRadius: 'inherit', // Inherit rounded rect from parent
        });

        // Insert at the beginning so it sits under the content
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

        // Use orthographic camera for a simple full-screen quad
        this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

        const geometry = new PlaneGeometry(2, 2);
        this.material = new ShaderMaterial({
            transparent: true,
            depthTest: false,
            depthWrite: false,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: [1, 1] },
            },
            vertexShader: VERTEX_SHADER,
            fragmentShader: FRAGMENT_SHADER,
        });

        this.mesh = new Mesh(geometry, this.material);
        this.scene.add(this.mesh);

        this.clock = new Clock();
        this.animationFrameId = null;
        this.isRunning = false;

        this.resizeObserver = new window.ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.container);

        this.resize();
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
        this.material.uniforms.u_resolution.value = [width, height];
    }

    start() {
        if (!this.enabled || this.isRunning) {
            return;
        }

        this.isRunning = true;
        this.clock.start();

        // Fade in
        this.container.style.opacity = this.options.opacity.toString();

        const renderLoop = () => {
            if (!this.isRunning) {
                return;
            }

            this.material.uniforms.u_time.value = this.clock.getElapsedTime();
            this.renderer.render(this.scene, this.camera);

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
            this.animationFrameId = null;
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

        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }

        if (this.geometry) {
            this.geometry.dispose();
        }
        if (this.material) {
            this.material.dispose();
        }
        if (this.renderer) {
            this.renderer.dispose();
        }

        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}
