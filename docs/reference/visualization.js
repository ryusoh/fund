/**
 * Reference implementation of the “Visualization” Three.js layer that sits on
 * top of the Perlin-noise background. The original logic lives in the bundled
 * `js/vendor/bundle.min.js`; this module mirrors the behaviour with readable
 * names so it can be reused elsewhere.
 *
 * Requirements:
 *   - `three` for the geometry/mesh/group helpers.
 *   - `gsap` for the appear/disappear animations.
 *   - An optional audio source exposing `getFrequency()` that returns a
 *     `Uint8Array`/`number[]` of magnitude values (0-255). If omitted, the
 *     visualization still animates, just without reactive scaling.
 */

import { CircleGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import gsap from 'gsap';

const DEG2RAD = Math.PI / 180;

class VisualizationParticle extends Group {
    constructor(index, { radius = 50 } = {}) {
        super();
        this.index = index;

        this.geometry = new CircleGeometry(radius, 3);
        this.material = new MeshBasicMaterial({
            color: 0xffffff,
            opacity: 0,
            transparent: true,
            wireframe: true,
        });
        this.mesh = new Mesh(this.geometry, this.material);
        this.mesh.position.set(0, 100, -100);
        this.mesh.visible = false;

        this.rotation.z = index * 3.6 * DEG2RAD;
        this.add(this.mesh);
    }

    appear() {
        return new Promise((resolve) => {
            const delay = Math.random();
            gsap.to(this.mesh.position, {
                delay,
                duration: 1,
                overwrite: true,
                z: 0,
                onComplete: resolve,
            });
            gsap.to(this.material, {
                delay,
                duration: 1,
                opacity: 1,
                onStart: () => {
                    this.mesh.visible = true;
                },
            });
        });
    }

    disappear() {
        return new Promise((resolve) => {
            const delay = Math.random() * 0.5;
            gsap.to(this.mesh.position, {
                delay,
                duration: 1,
                overwrite: true,
                z: -100,
                onComplete: resolve,
            });
            gsap.to(this.material, {
                delay,
                duration: 1,
                overwrite: true,
                opacity: 0,
                onComplete: () => {
                    this.mesh.visible = false;
                },
            });
        });
    }

    update(frequency = 0) {
        const scale = Math.max(frequency / 100, 1);
        gsap.set(this.mesh.scale, { z: scale });
    }
}

export class VisualizationLayer {
    constructor({
        particleCount = 100,
        audioSource = null,
        radius = 50,
        rotationSpeed = 0.0075,
    } = {}) {
        this.audioSource = audioSource;
        this.rotationSpeed = rotationSpeed;
        this.group = new Group();
        this.particles = Array.from({ length: particleCount }, (_, index) => {
            const particle = new VisualizationParticle(index, { radius });
            this.group.add(particle);
            return particle;
        });
    }

    show() {
        return Promise.all(this.particles.map((particle) => particle.appear()));
    }

    hide() {
        return Promise.all(this.particles.map((particle) => particle.disappear()));
    }

    update() {
        const frequencies = this.audioSource?.getFrequency?.() || [];
        this.group.rotation.z += this.rotationSpeed;

        this.particles.forEach((particle, index) => {
            const value = frequencies[index] ?? 0;
            particle.update(value);
        });
    }
}
