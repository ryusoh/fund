import { logger } from '../utils/logger.js';

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

uniform vec2 u_resolution;
uniform vec2 u_pointer;
uniform float u_time;
uniform float u_spotlightRadius;

uniform float u_tbodyTop;
uniform float u_tbodyBottom;
uniform float u_tbodyLeft;
uniform float u_tbodyWidth;

#define PI 3.14159265359
#define TWO_PI 6.28318530718

// --- Simplex 2D noise (Ashima Arts) ---
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289v2(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289((x * 34.0 + 1.0) * x); }
float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289v2(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m; m = m * m;
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
    // Base turbulence
    f += 0.50 * snoise(p);
    f += 0.25 * snoise(p * 2.01);
    
    // Domain warp: feed noise back as coordinate offset for organic swirls
    vec2 warp = vec2(
        snoise(p + vec2(1.7, 9.2)),
        snoise(p + vec2(8.3, 2.8))
    );
    f += 0.6 * snoise(p + warp * 1.5);
    return f; // roughly [-1, 1]
}

// CIE 1931 color matching approximation using Gaussian fits
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

// Thin-film interference algorithm (from thinFilmPlugin)
vec3 thinFilmColor(float opd) {
    vec3 xyz = vec3(0.0);
    float ySum = 0.0;
    float phase, refl;
    vec3 cmf;

    #define FILM_SAMPLE(LAMBDA) \
        phase = TWO_PI * opd / LAMBDA; \
        refl = sin(phase * 0.5); refl = refl * refl; \
        cmf = cieXYZ(LAMBDA); \
        xyz += cmf * refl; \
        ySum += cmf.y;

    FILM_SAMPLE(390.0) FILM_SAMPLE(406.0) FILM_SAMPLE(422.0) FILM_SAMPLE(438.0)
    FILM_SAMPLE(454.0) FILM_SAMPLE(470.0) FILM_SAMPLE(486.0) FILM_SAMPLE(502.0)
    FILM_SAMPLE(518.0) FILM_SAMPLE(534.0) FILM_SAMPLE(550.0) FILM_SAMPLE(566.0)
    FILM_SAMPLE(582.0) FILM_SAMPLE(598.0) FILM_SAMPLE(614.0) FILM_SAMPLE(630.0)
    FILM_SAMPLE(646.0) FILM_SAMPLE(662.0) FILM_SAMPLE(678.0) FILM_SAMPLE(694.0)

    xyz /= max(ySum, 0.001);
    xyz *= 2.8; // Brightness boost
    vec3 rgb = xyzToSRGB(xyz);
    
    // Reinhard tonemap and peak expansion
    rgb = rgb / (rgb + vec3(1.0));
    rgb *= 1.8;

    return clamp(rgb, vec3(0.0), vec3(1.0));
}

varying vec2 v_uv;

void main() {
    // Calculate logical pixel coordinates (top-down, matching DOM)
    float x = v_uv.x * u_resolution.x;
    float y = (1.0 - v_uv.y) * u_resolution.y;
    
    // Apply a small 1px inset to perfectly hug the CSS border
    float inset = 1.0;
    float tbodyTop = u_tbodyTop + inset;
    float tbodyBottom = u_tbodyBottom - inset;
    float tbodyLeft = u_tbodyLeft + inset;
    float tbodyWidth = u_tbodyWidth - (inset * 2.0);
    
    // HARD CLIPPING: The user strictly requested the effect does not bleed OUTSIDE the table borders.
    // If a pixel is outside the table geometry, discard it immediately.
    if (x < tbodyLeft || x > tbodyLeft + tbodyWidth || y < tbodyTop || y > tbodyBottom) {
        gl_FragColor = vec4(0.0);
        return;
    }

    // Calculate absolute distance to the outer rim boundaries of the table (now guaranteed to be inward)
    float leftDist = abs(x - tbodyLeft);
    float rightDist = abs(x - (tbodyLeft + tbodyWidth));
    float topDist = abs(y - tbodyTop);
    float bottomDist = abs(y - tbodyBottom);
    
    // Distance to the absolute closest edge
    float minRimDist = min(min(leftDist, rightDist), min(topDist, bottomDist));
    
    // The inward rim effect area (thickness of the glowing rim zone)
    float rimThickness = 30.0;
    
    // Optimization & Clipping: only render if we are near the rim
    if (minRimDist > rimThickness) {
        gl_FragColor = vec4(0.0);
        return;
    }
    
    // Pointer spotlight masking (mouse proximity)
    float distToPointer = distance(vec2(x, y), u_pointer);
    if (distToPointer > u_spotlightRadius) {
        gl_FragColor = vec4(0.0);
        return;
    }
    
    // Gaussian falloff for the mouse spotlight
    float spotlightIntensity = pow(1.0 - (distToPointer / u_spotlightRadius), 2.0);
    
    // Alpha falloff: max alpha (1.0) exactly on the border (minRimDist == 0),
    // fading out smoothly to 0.0 as we move away from the border.
    // We use a power curve so it stays bright near the core and drops off softly.
    float rimAlpha = pow(1.0 - (minRimDist / rimThickness), 2.5);
    
    // Combined intensity
    float alpha = rimAlpha * spotlightIntensity;
    
    if (alpha <= 0.01) {
        gl_FragColor = vec4(0.0);
        return;
    }
    
    // Calculate the physical Thin Film color
    // Use physical coordinates + time to drive the simplex noise
    vec2 noiseUv = vec2(x, y) * 0.005 - vec2(0.0, u_time * 0.2);
    
    // Distort the film thickness where the mouse is (mouse wake effect)
    float wake = spotlightIntensity * 0.5;
    
    float noiseVal = filmNoise(noiseUv);
    float noiseNorm = noiseVal * 0.5 + 0.5;
    
    // Spotlight influence shifts the film thickness (like cursor proximity in thinFilmPlugin)
    float pointerInfluence = spotlightIntensity * 0.5;
    
    // EXACT Oil on glass physics parameters from thinFilmPlugin.js
    float baseThickness = 300.0; // nm
    float range = 600.0;
    float thickness = baseThickness + range * (noiseNorm + pointerInfluence);
    thickness = max(150.0, thickness);
    
    float refractiveIndex = 1.4;
    
    // Simulate optical curvature at the rim
    // 1.0 right on the edge, 0.0 towards the inside
    float r_norm = 1.0 - (minRimDist / rimThickness);
    float cosTheta = mix(0.65, 1.0, 1.0 - r_norm);
    
    // Snell refraction
    float sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));
    float cosThetaT = sqrt(max(0.0, 1.0 - (sinTheta * sinTheta) / (refractiveIndex * refractiveIndex)));
    
    // Optical path difference
    float opd = 2.0 * refractiveIndex * thickness * cosThetaT;
    
    // Generate vivid rainbow iridescence (Oil Pattern)
    vec3 filmColor = thinFilmColor(opd);
    
    // Spotlight Beam Color (subtle cool white)
    vec3 beamCoreColor = vec3(0.97, 0.97, 1.0);
    vec3 beamEdgeColor = vec3(0.75, 0.82, 1.0);
    vec3 beamColor = mix(beamCoreColor, beamEdgeColor, 1.0 - spotlightIntensity);
    
    // Standard intensities (reverted massive boosts that caused white washout)
    float beamLight = spotlightIntensity * 0.8;
    float beamGlow = spotlightIntensity * 0.4;
    
    // Fresnel
    float schlick = pow(1.0 - cosTheta, 4.0);
    float fresnelMod = mix(0.5, 1.0, schlick);
    float filmVisibility = beamLight * fresnelMod * 1.5; // Slight boost to ensure oil is visible
    
    // Combine beam glow + iridescence
    vec3 color = beamColor * beamGlow * 0.5 
               + beamColor * beamLight * 0.2 
               + filmColor * filmVisibility;
               
    // Smooth alpha based on distance from the edge (fades inward)
    float finalAlpha = rimAlpha * spotlightIntensity;
    
    // Output color directly. Additive blending (SRC_ALPHA, ONE) will multiply rgb by finalAlpha
    gl_FragColor = vec4(color, finalAlpha);
}
`;

function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        logger.error('WebGL Shader Error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

export class TableGlassWebGL {
    constructor(parentEffect) {
        this.parent = parentEffect;
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'table-glass-webgl';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        // Ensure it sits above the 2D canvas but behind the text.
        // The 2D canvas is z-index -1. We can be z-index 0, but the parent container holds the text.
        this.canvas.style.zIndex = '0';

        // Handle sticky positioning
        this.syncPositionStyle();

        this.gl = this.canvas.getContext('webgl', {
            alpha: true,
            premultipliedAlpha: false,
            antialias: false, // We do soft distance-based AA in shader
        });

        if (!this.gl || typeof this.gl.createShader !== 'function') {
            logger.warn('WebGL not supported, fluid caustic grid disabled.');
            this.gl = null;
            return;
        }

        this.initGL();

        // Append to parent container
        if (this.parent._scrollable) {
            // Must insert right after the 2D canvas
            this.parent.container.insertBefore(this.canvas, this.parent.canvas.nextSibling);
        } else {
            this.parent.container.appendChild(this.canvas);
        }
    }

    syncPositionStyle() {
        if (this.parent._scrollable) {
            this.canvas.style.position = 'sticky';
            this.canvas.style.marginBottom = `-${this.parent.height}px`;
        } else {
            this.canvas.style.position = 'absolute';
            this.canvas.style.marginBottom = '';
        }

        // Match header exclusion
        if (this.parent.options.excludeHeader) {
            this.canvas.style.top = `${this.parent._headerHeight}px`;
            this.canvas.style.borderRadius = '0';
        } else {
            this.canvas.style.top = '0';
            this.canvas.style.borderRadius = '8px';
        }
    }

    initGL() {
        const gl = this.gl;
        const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC);
        const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);

        this.program = gl.createProgram();
        gl.attachShader(this.program, vs);
        gl.attachShader(this.program, fs);
        gl.linkProgram(this.program);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            logger.error('WebGL Program Error:', gl.getProgramInfoLog(this.program));
            return;
        }

        // Fullscreen quad
        const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        const positionLocation = gl.getAttribLocation(this.program, 'a_position');
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

        // Uniforms
        this.uniforms = {
            resolution: gl.getUniformLocation(this.program, 'u_resolution'),
            pointer: gl.getUniformLocation(this.program, 'u_pointer'),
            time: gl.getUniformLocation(this.program, 'u_time'),
            spotlightRadius: gl.getUniformLocation(this.program, 'u_spotlightRadius'),
            tbodyTop: gl.getUniformLocation(this.program, 'u_tbodyTop'),
            tbodyBottom: gl.getUniformLocation(this.program, 'u_tbodyBottom'),
            tbodyLeft: gl.getUniformLocation(this.program, 'u_tbodyLeft'),
            tbodyWidth: gl.getUniformLocation(this.program, 'u_tbodyWidth'),
        };

        // Blend mode for glowing effects
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // Screen/Additive blending
    }

    resize(width, height, dpr) {
        if (!this.gl) {
            return;
        }
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.syncPositionStyle();
    }

    draw(state, options, width, height, dpr, rows) {
        if (!this.gl || !options.rowHoverEffect?.enabled || !rows || rows.length === 0) {
            return;
        }

        const gl = this.gl;
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        // Don't draw if pointer is perfectly zeroed
        if (state.pointer.x === 0 && state.pointer.y === 0) {
            return;
        }

        gl.useProgram(this.program);

        const mouseX = ((state.pointer.x + 1) / 2) * width;
        const mouseY = ((state.pointer.y + 1) / 2) * height;

        gl.uniform2f(this.uniforms.resolution, width, height);
        // We pass logical pixels to shader, it handles its own coordinates
        gl.uniform2f(this.uniforms.pointer, mouseX, mouseY);
        gl.uniform1f(this.uniforms.time, state.continuousPhase);
        gl.uniform1f(
            this.uniforms.spotlightRadius,
            options.rowHoverEffect.spotlightRadius || 300.0
        );

        const firstRow = rows[0];
        const lastRow = rows[rows.length - 1];
        gl.uniform1f(this.uniforms.tbodyTop, firstRow.top);
        gl.uniform1f(this.uniforms.tbodyBottom, lastRow.top + lastRow.height);
        gl.uniform1f(this.uniforms.tbodyLeft, firstRow.left);
        gl.uniform1f(this.uniforms.tbodyWidth, firstRow.width);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    dispose() {
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        if (this.gl) {
            const ext = this.gl.getExtension('WEBGL_lose_context');
            if (ext) {
                ext.loseContext();
            }
        }
    }
}
