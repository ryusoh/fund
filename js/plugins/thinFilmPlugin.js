import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Thin-film iridescence WebGL overlay plugin for Chart.js doughnut charts.
//
// Physically models oil-film / soap-bubble chromatic interference using:
//   - Simplex noise for organic film-thickness variation (Cartesian domain warping)
//   - Thin-film interference equation: OPD = 2 * n * d * cos(theta_refracted)
//   - Spectral wavelength -> sRGB via smooth bump approximation
//   - Fresnel-weighted intensity (Schlick approximation)
//
// Renders on a separate WebGL canvas overlaid on the Chart.js canvas,
// clipped to the currently hovered donut slice.
// ---------------------------------------------------------------------------

const VERTEX_SRC = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SRC = `
precision highp float;

varying vec2 v_uv;

uniform vec2 u_center;       // donut center (physical pixels, top-left origin)
uniform float u_innerRadius;
uniform float u_outerRadius;
uniform float u_startAngle;  // hovered arc start (radians, Chart.js convention)
uniform float u_endAngle;    // hovered arc end
uniform vec2 u_resolution;   // canvas size in physical pixels
uniform float u_time;
uniform float u_filmThicknessBase;   // nm, ~300-500
uniform float u_filmThicknessRange;  // nm, ~200-400
uniform vec2 u_pointer;      // cursor position (physical pixels, top-left origin)
uniform float u_refractiveIndex;     // oil ~1.33-1.5
uniform float u_opacity;

// Spotlight beam: directed light that causes the iridescence
uniform vec2 u_beamCenter;  // where the beam hits the slice (physical pixels)
uniform float u_beamRadius; // beam spread radius (physical pixels)
uniform float u_beamIntensity; // peak brightness of the beam (0-1)

#define PI 3.14159265359
#define TWO_PI 6.28318530718

// --- Simplex 2D noise (Ashima Arts / Ian McEwan) ---
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289v2(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289((x * 34.0 + 1.0) * x); }

float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                        -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289v2(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                             + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
                             dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x_ = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x_) - 0.5;
    vec3 ox = floor(x_ + 0.5);
    vec3 a0 = x_ - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}

// Domain-warped FBM for organic oil-film thickness patterns
float filmNoise(vec2 p) {
    float f = 0.0;
    f += 0.50 * snoise(p);
    f += 0.25 * snoise(p * 2.01);
    f += 0.125 * snoise(p * 4.03);

    // Domain warp: feed noise back as coordinate offset for organic swirls
    vec2 warp = vec2(
        snoise(p + vec2(1.7, 9.2)),
        snoise(p + vec2(8.3, 2.8))
    );
    f += 0.4 * snoise(p + warp * 0.6);

    return f; // roughly [-1, 1]
}

// CIE 1931 color matching approximation using Gaussian fits
// (Wyman, Sloan & Shirley 2013). Much more accurate than piecewise linear.
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

// XYZ -> linear sRGB (D65 illuminant)
vec3 xyzToSRGB(vec3 xyz) {
    return vec3(
        dot(xyz, vec3( 3.2406, -1.5372, -0.4986)),
        dot(xyz, vec3(-0.9689,  1.8758,  0.0415)),
        dot(xyz, vec3( 0.0557, -0.2040,  1.0570))
    );
}

// Thin-film interference: 20-sample spectral integration.
//
// Oil on glass: air (n=1) -> oil (n~1.4) -> glass (n~1.5).
// Both reflections hit a denser medium -> both get pi phase shift
// -> they cancel -> net phase shift = 0 (no +PI term).
//
// Uses sin^2(phase/2) for reflectance envelope (full [0,1] range)
// to produce visible colors. Accumulates in CIE XYZ then converts
// to sRGB, preserving the natural saturation variation across
// interference orders (vivid pure colors vs washed-out pastels).

vec3 thinFilmColor(float opd) {
    vec3 xyz = vec3(0.0);
    float ySum = 0.0;

    // 20 samples across visible spectrum (390-710nm)
    // Unrolled: WebGL 1.0 doesn't support variable loop bounds
    float phase, refl;
    vec3 cmf;

    // Sample macro: lambda -> accumulate XYZ
    #define FILM_SAMPLE(LAMBDA) \
        phase = TWO_PI * opd / LAMBDA; \
        refl = sin(phase * 0.5); refl = refl * refl; \
        cmf = cieXYZ(LAMBDA); \
        xyz += cmf * refl; \
        ySum += cmf.y;

    FILM_SAMPLE(390.0)
    FILM_SAMPLE(406.0)
    FILM_SAMPLE(422.0)
    FILM_SAMPLE(438.0)
    FILM_SAMPLE(454.0)
    FILM_SAMPLE(470.0)
    FILM_SAMPLE(486.0)
    FILM_SAMPLE(502.0)
    FILM_SAMPLE(518.0)
    FILM_SAMPLE(534.0)
    FILM_SAMPLE(550.0)
    FILM_SAMPLE(566.0)
    FILM_SAMPLE(582.0)
    FILM_SAMPLE(598.0)
    FILM_SAMPLE(614.0)
    FILM_SAMPLE(630.0)
    FILM_SAMPLE(646.0)
    FILM_SAMPLE(662.0)
    FILM_SAMPLE(678.0)
    FILM_SAMPLE(694.0)

    // Normalize by total luminance of the illuminant (white point)
    // This preserves natural saturation: when many wavelengths constructively
    // interfere the result washes toward white; when few do it stays vivid.
    xyz /= max(ySum, 0.001);

    // Brightness boost: physical film is dim, we want visible effect
    xyz *= 2.8;

    vec3 rgb = xyzToSRGB(xyz);

    // Soft tonemap (Reinhard per-channel) to avoid harsh clipping
    rgb = rgb / (rgb + vec3(1.0));
    // Re-expand: Reinhard compresses [0,inf) to [0,1), but we want
    // ~1.0 peak for vivid colors
    rgb *= 1.8;

    return clamp(rgb, vec3(0.0), vec3(1.0));
}

void main() {
    // Convert UV to pixel coordinates (flip Y: WebGL bottom-left -> Canvas top-left)
    vec2 pixel = vec2(v_uv.x, 1.0 - v_uv.y) * u_resolution;

    // Delta from donut center (circular — Chart.js arcs are circles)
    vec2 delta = pixel - u_center;
    float dist = length(delta);

    // Donut ring test
    if (dist < u_innerRadius || dist > u_outerRadius) {
        discard;
    }

    // Angle (Chart.js convention: atan2(y, x), 0 = right, CW positive)
    float angle = atan(delta.y, delta.x);

    // Arc containment (handles wrap-around)
    float a = angle - u_startAngle;
    a = a - floor(a / TWO_PI) * TWO_PI;
    float arcSpan = u_endAngle - u_startAngle;
    arcSpan = arcSpan - floor(arcSpan / TWO_PI) * TWO_PI;

    if (a > arcSpan) {
        discard;
    }

    // Radial position within the band [0, 1]
    float r_norm = (dist - u_innerRadius) / max(u_outerRadius - u_innerRadius, 1.0);

    // --- Film thickness from domain-warped noise ---
    // Use polar-aware coordinates: stretch along tangent direction
    // so the noise forms elongated streaks like real fluid film flow.
    float angleNorm = angle / TWO_PI;
    float tangential = angleNorm * u_outerRadius * 0.06; // arc-length scaled
    float radial = r_norm * 2.0;                          // compressed radially
    vec2 noisePos = vec2(tangential, radial);
    noisePos += vec2(u_time * 0.1, u_time * -0.06);
    float noise = filmNoise(noisePos);

    // Pointer proximity: locally shift film thickness
    float pointerDist = length(pixel - u_pointer);
    float pointerInfluence = smoothstep(100.0, 0.0, pointerDist) * 0.5;

    float thickness = u_filmThicknessBase + u_filmThicknessRange * (noise * 0.5 + 0.5 + pointerInfluence);
    thickness = max(150.0, thickness);

    // Viewing angle (approximate: more grazing at band edges)
    float cosTheta = mix(0.65, 1.0, 1.0 - abs(r_norm * 2.0 - 1.0));

    // Snell refraction
    float n = u_refractiveIndex;
    float sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));
    float cosThetaT = sqrt(max(0.0, 1.0 - (sinTheta * sinTheta) / (n * n)));

    // Optical path difference
    float opd = 2.0 * n * thickness * cosThetaT;

    // --- Spotlight beam ---
    // The beam is a cone of light hitting the glass from above.
    // It provides both a visible glow and the energy that excites the film.
    float beamDist = length(pixel - u_beamCenter);
    // Smooth Gaussian-ish falloff
    float beamFalloff = exp(-2.5 * (beamDist * beamDist) / (u_beamRadius * u_beamRadius));
    // Soft outer halo extends further than the core
    float beamHalo = exp(-0.8 * (beamDist * beamDist) / (u_beamRadius * u_beamRadius * 4.0));
    float beamLight = u_beamIntensity * beamFalloff;
    float beamGlow = u_beamIntensity * beamHalo * 0.35;

    // Visible beam: near-white spotlight (neutral so film colors come through)
    // Very slight cool tint at edges only (lens chromatic fringe)
    vec3 beamCoreColor = vec3(0.97, 0.97, 1.0);   // near-neutral white
    vec3 beamEdgeColor = vec3(0.75, 0.82, 1.0);    // subtle blue fringe
    float edgeMix = smoothstep(0.3, 1.2, beamDist / max(u_beamRadius, 1.0));
    vec3 beamColor = mix(beamCoreColor, beamEdgeColor, edgeMix);

    // --- Iridescent film color, modulated by beam ---
    vec3 filmColor = thinFilmColor(opd);

    // Fresnel: stronger iridescence at grazing angles
    float schlick = pow(1.0 - cosTheta, 4.0);
    float fresnelMod = mix(0.5, 1.0, schlick);

    // The film is only visible where the beam illuminates it
    float filmVisibility = beamLight * fresnelMod;

    // Soft feathering at arc edges
    float featherArc = smoothstep(0.0, 0.05 * arcSpan, a) *
                        smoothstep(arcSpan, arcSpan - 0.05 * arcSpan, a);

    // Radial feathering
    float featherRadial = smoothstep(0.0, 0.08, r_norm) * smoothstep(1.0, 0.92, r_norm);

    float feather = featherArc * featherRadial;

    // Combine: beam glow (the light itself) + film iridescence (caused by light)
    vec3 color = beamColor * beamGlow * 0.5  // subtle ambient beam glow
               + beamColor * beamLight * 0.2  // direct beam on glass surface
               + filmColor * filmVisibility;   // iridescence where beam hits

    float alpha = u_opacity * feather * max(beamGlow * 0.5, filmVisibility + beamLight * 0.2);

    // Pre-multiplied alpha
    gl_FragColor = vec4(color * u_opacity * feather, alpha);
}
`;

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error('Shader compile error: ' + info);
    }
    return shader;
}

function createProgram(gl, vertSrc, fragSrc) {
    const vs = createShader(gl, gl.VERTEX_SHADER, vertSrc);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fragSrc);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error('Program link error: ' + info);
    }
    return program;
}

function initGL(canvas) {
    const gl = canvas.getContext('webgl', {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        preserveDrawingBuffer: false,
    });
    if (!gl) {
        return null;
    }

    const program = createProgram(gl, VERTEX_SRC, FRAGMENT_SRC);

    // Full-screen quad
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    // prettier-ignore
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 1, -1, -1, 1,
        -1, 1, 1, -1, 1, 1,
    ]), gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Cache uniform locations
    const uniforms = {};
    const names = [
        'u_center',
        'u_innerRadius',
        'u_outerRadius',
        'u_startAngle',
        'u_endAngle',
        'u_resolution',
        'u_time',
        'u_filmThicknessBase',
        'u_filmThicknessRange',
        'u_pointer',
        'u_refractiveIndex',
        'u_opacity',
        'u_beamCenter',
        'u_beamRadius',
        'u_beamIntensity',
    ];
    for (const name of names) {
        uniforms[name] = gl.getUniformLocation(program, name);
    }

    return { gl, program, uniforms };
}

function ensureOverlay(chart) {
    if (chart._thinFilmState) {
        return chart._thinFilmState;
    }

    const chartCanvas = chart.canvas;
    if (!chartCanvas || !chartCanvas.parentElement) {
        return null;
    }

    // Create overlay canvas
    const overlay = document.createElement('canvas');
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '1';

    // Ensure parent is positioned
    const parent = chartCanvas.parentElement;
    const pStyle = window.getComputedStyle(parent);
    if (pStyle.position === 'static') {
        parent.style.position = 'relative';
    }
    parent.appendChild(overlay);

    const glState = initGL(overlay);
    if (!glState) {
        parent.removeChild(overlay);
        logger.warn('Thin-film plugin: WebGL not available');
        return null;
    }

    const state = {
        overlay,
        ...glState,
        startTime: window.performance.now(),
    };
    chart._thinFilmState = state;
    return state;
}

function syncSize(state, chartCanvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = chartCanvas.getBoundingClientRect();
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (state.overlay.width !== w || state.overlay.height !== h) {
        state.overlay.width = w;
        state.overlay.height = h;
    }
}

export const thinFilmPlugin = {
    id: 'thinFilmPlugin',

    afterDatasetsDraw(chart) {
        if (typeof window === 'undefined') {
            return;
        }
        const hoveredIndex = chart.hoveredSliceIndex;
        const meta = chart.getDatasetMeta(0);
        if (!meta || meta.data.length === 0) {
            return;
        }

        // Only render when a slice is actively hovered
        if (hoveredIndex === undefined || !meta.data[hoveredIndex]) {
            // Clear overlay if it exists
            if (chart._thinFilmState) {
                const { gl, overlay } = chart._thinFilmState;
                gl.viewport(0, 0, overlay.width, overlay.height);
                gl.clear(gl.COLOR_BUFFER_BIT);
            }
            return;
        }

        const state = ensureOverlay(chart);
        if (!state) {
            return;
        }

        syncSize(state, chart.canvas);

        const { gl, program, uniforms, overlay } = state;
        const dpr = window.devicePixelRatio || 1;
        const arc = meta.data[hoveredIndex];
        const props = arc.getProps(
            ['x', 'y', 'startAngle', 'endAngle', 'outerRadius', 'innerRadius'],
            true
        );

        // Pointer position (in physical pixels, top-left origin like Canvas 2D)
        const cursor = chart._cursorPos;
        const pointerX = cursor ? cursor.x * dpr : props.x * dpr;
        const pointerY = cursor ? cursor.y * dpr : props.y * dpr;

        gl.viewport(0, 0, overlay.width, overlay.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        gl.useProgram(program);

        // All coordinates in physical pixels (top-left origin)
        gl.uniform2f(uniforms.u_center, props.x * dpr, props.y * dpr);
        gl.uniform1f(uniforms.u_innerRadius, props.innerRadius * dpr);
        gl.uniform1f(uniforms.u_outerRadius, props.outerRadius * dpr);
        gl.uniform1f(uniforms.u_startAngle, props.startAngle);
        gl.uniform1f(uniforms.u_endAngle, props.endAngle);
        gl.uniform2f(uniforms.u_resolution, overlay.width, overlay.height);

        const elapsed = (window.performance.now() - state.startTime) / 1000;
        gl.uniform1f(uniforms.u_time, elapsed);
        gl.uniform1f(uniforms.u_filmThicknessBase, 400.0);
        gl.uniform1f(uniforms.u_filmThicknessRange, 300.0);
        gl.uniform2f(uniforms.u_pointer, pointerX, pointerY);
        gl.uniform1f(uniforms.u_refractiveIndex, 1.4);
        gl.uniform1f(uniforms.u_opacity, 0.55);

        // Spotlight beam: centered on the hovered arc's midpoint
        const midAngle = (props.startAngle + props.endAngle) / 2;
        const midRadius = (props.innerRadius + props.outerRadius) / 2;
        const beamX = (props.x + Math.cos(midAngle) * midRadius) * dpr;
        const beamY = (props.y + Math.sin(midAngle) * midRadius) * dpr;
        const band = (props.outerRadius - props.innerRadius) * dpr;
        gl.uniform2f(uniforms.u_beamCenter, beamX, beamY);
        gl.uniform1f(uniforms.u_beamRadius, band * 1.2);
        gl.uniform1f(uniforms.u_beamIntensity, 1.0);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
    },

    destroy(chart) {
        if (chart._thinFilmState) {
            const { gl, overlay } = chart._thinFilmState;
            const ext = gl.getExtension('WEBGL_lose_context');
            if (ext) {
                ext.loseContext();
            }
            if (overlay.parentElement) {
                overlay.parentElement.removeChild(overlay);
            }
            chart._thinFilmState = null;
        }
    },
};
