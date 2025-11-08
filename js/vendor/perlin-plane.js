/**
 * Human-friendly extraction of the `cp` background class that lives inside
 * `js/vendor/bundle.min.js`. The original code extends an internal base
 * (`uc`) and wires into GSAP/Three.js at runtime; this module mirrors the
 * behaviour with readable names so the logic can be studied or repurposed.
 *
 * The class below only depends on the local `three.module.js`. Swap the
 * import path if you keep the file elsewhere.
 */

import {
    Clock,
    Mesh,
    MeshBasicMaterial,
    PerspectiveCamera,
    PlaneGeometry,
    Points,
    RepeatWrapping,
    Scene,
    ShaderMaterial,
    TextureLoader,
    WebGLRenderer,
} from './three.module.js';

const POINT_SPRITE_URL = new URL('../../assets/dot.png', import.meta.url).pathname;

const GLSL_NOISE_CHUNK = `#define GLSLIFY 1
//
// GLSL textureless classic 3D noise "cnoise",
// with an RSL-style periodic variant "pnoise".
// Author:  Stefan Gustavson (stefan.gustavson@liu.se)
// Version: 2011-10-11
//
// Many thanks to Ian McEwan of Ashima Arts for the
// ideas for permutation and gradient selection.
//
// Copyright (c) 2011 Stefan Gustavson. All rights reserved.
// Distributed under the MIT license. See LICENSE file.
// https://github.com/ashima/webgl-noise
//

vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 mod289(vec4 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x) {
  return mod289(((x * 34.0) + 1.0) * x);
}

vec4 taylorInvSqrt(vec4 r) {
  return 1.79284291400159 - 0.85373472095314 * r;
}

vec3 fade(vec3 t) {
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

float pnoise(vec3 P, vec3 rep) {
  vec3 Pi0 = mod(floor(P), rep);
  vec3 Pi1 = mod(Pi0 + vec3(1.0), rep);
  Pi0 = mod289(Pi0);
  Pi1 = mod289(Pi1);
  vec3 Pf0 = fract(P);
  vec3 Pf1 = Pf0 - vec3(1.0);
  vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
  vec4 iy = vec4(Pi0.yy, Pi1.yy);
  vec4 iz0 = Pi0.zzzz;
  vec4 iz1 = Pi1.zzzz;

  vec4 ixy = permute(permute(ix) + iy);
  vec4 ixy0 = permute(ixy + iz0);
  vec4 ixy1 = permute(ixy + iz1);

  vec4 gx0 = ixy0 * (1.0 / 7.0);
  vec4 gy0 = fract(floor(gx0) * (1.0 / 7.0)) - 0.5;
  gx0 = fract(gx0);
  vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
  vec4 sz0 = step(gz0, vec4(0.0));
  gx0 -= sz0 * (step(0.0, gx0) - 0.5);
  gy0 -= sz0 * (step(0.0, gy0) - 0.5);

  vec4 gx1 = ixy1 * (1.0 / 7.0);
  vec4 gy1 = fract(floor(gx1) * (1.0 / 7.0)) - 0.5;
  gx1 = fract(gx1);
  vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
  vec4 sz1 = step(gz1, vec4(0.0));
  gx1 -= sz1 * (step(0.0, gx1) - 0.5);
  gy1 -= sz1 * (step(0.0, gy1) - 0.5);

  vec3 g000 = vec3(gx0.x, gy0.x, gz0.x);
  vec3 g100 = vec3(gx0.y, gy0.y, gz0.y);
  vec3 g010 = vec3(gx0.z, gy0.z, gz0.z);
  vec3 g110 = vec3(gx0.w, gy0.w, gz0.w);
  vec3 g001 = vec3(gx1.x, gy1.x, gz1.x);
  vec3 g101 = vec3(gx1.y, gy1.y, gz1.y);
  vec3 g011 = vec3(gx1.z, gy1.z, gz1.z);
  vec3 g111 = vec3(gx1.w, gy1.w, gz1.w);

  vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
  g000 *= norm0.x;
  g010 *= norm0.y;
  g100 *= norm0.z;
  g110 *= norm0.w;
  vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
  g001 *= norm1.x;
  g011 *= norm1.y;
  g101 *= norm1.z;
  g111 *= norm1.w;

  float n000 = dot(g000, Pf0);
  float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
  float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
  float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
  float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
  float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
  float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
  float n111 = dot(g111, Pf1);

  vec3 fade_xyz = fade(Pf0);
  vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
  vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
  float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);
  return 2.2 * n_xyz;
}`;

const FRAGMENT_SHADER = `${GLSL_NOISE_CHUNK}
uniform sampler2D image;
uniform vec3 tint;
varying float noise;

void main() {
  vec4 sprite = texture2D(image, gl_PointCoord);
  float alpha = clamp(0.35 + 0.35 * noise, 0.0, 1.0);
  gl_FragColor = vec4(tint, alpha) * sprite;
}`;

const VERTEX_SHADER = `${GLSL_NOISE_CHUNK}
uniform float multiplier;
uniform float time;
varying float noise;

void main() {
  noise = pnoise(position * 0.005 - time, vec3(100.0));
  vec3 displaced = position;
  displaced.z += 160.0 * noise * multiplier;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  gl_PointSize = 2.0;
}`;

export class PerlinNoisePlane extends Points {
    constructor({
        size = 1,
        textureUrl = POINT_SPRITE_URL,
        tint = [1, 1, 1],
        speed = 0.01,
        angle = -Math.PI / 3.2,
    } = {}) {
        const height = 2 * size;
        const width = 2 * size;

        const geometry = new PlaneGeometry(width, height, height / 8, width / 8);
        const sprite = new TextureLoader().load(textureUrl);
        sprite.premultiplyAlpha = true;
        sprite.wrapS = RepeatWrapping;
        sprite.wrapT = RepeatWrapping;

        const material = new ShaderMaterial({
            transparent: true,
            depthTest: false,
            depthWrite: false,
            uniforms: {
                image: { value: sprite },
                multiplier: { value: 0 },
                time: { value: 0 },
                tint: { value: tint },
            },
            fragmentShader: FRAGMENT_SHADER,
            vertexShader: VERTEX_SHADER,
        });

        super(geometry, material);

        this.height = height;
        this.width = width;
        this.velocity = speed;

        this.position.z = -100;

        this.overlay = new Mesh(
            new PlaneGeometry(width, height, 1, 1),
            new MeshBasicMaterial({ color: 0x000000, opacity: 0, transparent: true })
        );
        this.overlay.position.z = 1;
        this.add(this.overlay);
    }

    show() {
        this.overlay.material.opacity = 1;
    }

    hide() {
        this.overlay.material.opacity = 0;
    }

    update(delta = 0) {
        this.material.uniforms.time.value += this.velocity + delta;
    }

    onRoute(pathname) {
        if (pathname === '/about') {
            this.material.uniforms.multiplier.value = 1;
            this.position.y = -this.height / 4;
            this.rotation.x = -Math.PI / 2;
        } else {
            this.material.uniforms.multiplier.value = 0;
            this.position.y = 0;
            this.rotation.x = 0;
        }
    }
}

const canUseWebGL = () => {
    if (typeof window === 'undefined' || !window.WebGLRenderingContext) {
        return false;
    }
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        return !!gl;
    } catch (error) {
        return false;
    }
};

export const mountPerlinPlaneBackground = ({
    parent = typeof document !== 'undefined' ? document.body : null,
    className = 'perlin-background-layer',
    blendMode = 'screen',
    opacity = 0.85,
    sizeFactor = 0.9,
    tint = [1, 1, 1],
    speed = 0.01,
    angle = -Math.PI / 3.2,
    respectReducedMotion = true,
    maxPixelRatio = 2,
} = {}) => {
    if (typeof window === 'undefined' || !parent) {
        return null;
    }

    const motionQuery =
        respectReducedMotion && typeof window.matchMedia === 'function'
            ? window.matchMedia('(prefers-reduced-motion: reduce)')
            : null;

    if ((motionQuery && motionQuery.matches) || !canUseWebGL()) {
        return null;
    }

    const container = document.createElement('div');
    container.className = className;
    Object.assign(container.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '0',
        pointerEvents: 'none',
        overflow: 'hidden',
        mixBlendMode: blendMode,
        opacity: opacity.toString(),
    });
    if (parent.firstChild) {
        parent.insertBefore(container, parent.firstChild);
    } else {
        parent.appendChild(container);
    }

    const renderer = new WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
    renderer.setSize(window.innerWidth, window.innerHeight);
    Object.assign(renderer.domElement.style, {
        width: '100%',
        height: '100%',
        display: 'block',
    });
    container.appendChild(renderer.domElement);

    const scene = new Scene();
    const camera = new PerspectiveCamera(42, window.innerWidth / window.innerHeight || 1, 1, 1000);
    camera.position.z = 360;

    const baseSize = Math.min(window.innerWidth, window.innerHeight) * sizeFactor;
    const plane = new PerlinNoisePlane({ size: baseSize, tint, speed, angle });
    plane.userData.baseSize = baseSize;
    plane.overlay.visible = false;
    plane.material.uniforms.multiplier.value = 1.2;
    plane.rotation.x = angle;
    plane.position.y = -80;
    plane.position.z = -50;
    scene.add(plane);

    const clock = new Clock();
    let animationFrame;

    const renderLoop = () => {
        plane.update(clock.getDelta());
        renderer.render(scene, camera);
        animationFrame = window.requestAnimationFrame(renderLoop);
    };
    renderLoop();

    const updateScale = () => {
        const nextSize = Math.min(window.innerWidth, window.innerHeight) * 0.85;
        const scale = nextSize / plane.userData.baseSize;
        plane.scale.set(scale, scale, 1);
    };

    const onResize = () => {
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth / window.innerHeight || 1;
        camera.updateProjectionMatrix();
        updateScale();
    };
    window.addEventListener('resize', onResize);

    let motionListener;
    if (motionQuery) {
        motionListener = (event) => {
            if (event.matches) {
                cleanup();
            }
        };
        if (typeof motionQuery.addEventListener === 'function') {
            motionQuery.addEventListener('change', motionListener);
        } else if (typeof motionQuery.addListener === 'function') {
            motionQuery.addListener(motionListener);
        }
    }

    let destroyed = false;
    const cleanup = () => {
        if (destroyed) return;
        destroyed = true;
        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
        }
        window.removeEventListener('resize', onResize);
        renderer.dispose();
        if (container.parentNode) {
            container.parentNode.removeChild(container);
        }
        if (motionQuery && motionListener) {
            if (typeof motionQuery.removeEventListener === 'function') {
                motionQuery.removeEventListener('change', motionListener);
            } else if (typeof motionQuery.removeListener === 'function') {
                motionQuery.removeListener(motionListener);
            }
        }
    };

    return {
        container,
        renderer,
        scene,
        camera,
        plane,
        dispose: cleanup,
    };
};
