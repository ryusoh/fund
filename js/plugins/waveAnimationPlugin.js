import { easeInOutSine } from '../utils/easing.js';
import { PLUGIN_CONFIGS } from '../config.js';

// --- Wave Animation Plugin Helpers ---
function _startWaveAnimation(chart) {
    const animState = chart.waveAnimation;
    if (animState.animationFrameId) return; // Already running

    const animate = () => {
        if (!chart.canvas || !document.body.contains(chart.canvas)) { // Stop if chart is gone
            _stopWaveAnimation(chart);
            return;
        }

        const meta = chart.getDatasetMeta(0);
        // let currentInnerRadiusValue = 0; // Not directly used for outward expansion logic here
        let currentOuterRadiusValue = 0;
        if (meta && meta.data && meta.data.length) {
            // currentInnerRadiusValue = meta.data[0].innerRadius;
            currentOuterRadiusValue = meta.data[0].outerRadius;
        }

        // Stop if no outer edge (e.g. chart cleared) and no waves left to animate
        if (currentOuterRadiusValue <= 0 && animState.waves.length === 0) {
            _stopWaveAnimation(chart);
            return;
        }
        
        // Update wave states, pass outerRadius for spawning waves from the outside
        updateWaveState(chart, currentOuterRadiusValue > 0 ? currentOuterRadiusValue : 0);
        chart.draw(); // Redraw the chart to show updated waves
        
        // Only continue animation if there are active waves or potential to spawn new ones
        if (animState.waves.length > 0 || (currentOuterRadiusValue > 0 && animState.waves.length < animState.config.maxWaves)) {
            animState.animationFrameId = requestAnimationFrame(animate);
        } else {
            _stopWaveAnimation(chart); // No waves and no way to make new ones
        }
    };
    animState.animationFrameId = requestAnimationFrame(animate);
}

function _stopWaveAnimation(chart) {
    const animState = chart.waveAnimation;
    if (animState && animState.animationFrameId) {
        cancelAnimationFrame(animState.animationFrameId);
        animState.animationFrameId = null;
    }
}

function updateWaveState(chart, currentOuterRadiusValue) { 
    const animState = chart.waveAnimation;
    if (!animState) return; 
    
    const config = animState.config;
    const now = Date.now();

    // Spawn new waves if conditions are met
    if (currentOuterRadiusValue > 0 && // Ensure there's an outer edge to spawn from
        now - animState.lastSpawnTime > config.spawnInterval && 
        animState.waves.length < config.maxWaves) {
        
        animState.waves.push({
            radius: currentOuterRadiusValue,    // Start at the current outer edge of the doughnut
            opacity: config.spawnOpacity,
            spawnRadius: currentOuterRadiusValue, // Store initial radius for opacity calculation
            targetRadius: currentOuterRadiusValue + config.expansionDistance // Expand outwards
        });
        animState.lastSpawnTime = now;
    }

    // Update and filter existing waves
    animState.waves = animState.waves.filter(wave => {
        wave.radius += config.speed; // Expand the wave outwards

        // Adjust opacity: fade out as it expands from spawnRadius to targetRadius
        const { spawnOpacity, expansionDistance } = config;
        if (expansionDistance > 0) {
            let progress = 0;
            if (typeof wave.spawnRadius === 'number') {
                 progress = Math.min(1, Math.max(0, (wave.radius - wave.spawnRadius) / expansionDistance));
            } else { 
                progress = 1; // Fallback: if spawnRadius is missing, assume fully progressed
            }
            const easedProgress = easeInOutSine(progress);
            wave.opacity = spawnOpacity * (1 - easedProgress); // Fade from spawnOpacity to 0
        } else {
            wave.opacity = 0; // If no expansion distance, fade out immediately
        }
        
        // Keep wave if it's still visible and large enough
        return wave.radius < wave.targetRadius && wave.opacity > config.targetOpacityFade;
    });
}

export const waveAnimationPlugin = {
    id: 'waveCenterAnimation',
    beforeInit: function(chart) {
        // Use the imported configuration
        chart.waveAnimation = {
            waves: [],
            lastSpawnTime: 0,
            animationFrameId: null,
            config: PLUGIN_CONFIGS.WAVE_ANIMATION
        };
    },
    afterDestroy: function(chart) {
        _stopWaveAnimation(chart); 
    },
    beforeDatasetsDraw: function(chart, args, options) {
        if (chart.config.type !== 'doughnut' || !chart.waveAnimation) return;

        const animState = chart.waveAnimation;
        const meta = chart.getDatasetMeta(0);
        let outerRadius = meta?.data[0]?.outerRadius || 0;
        let centerX = meta?.data[0]?.x || 0;
        let centerY = meta?.data[0]?.y || 0;

        if (!animState.animationFrameId && outerRadius > 0) _startWaveAnimation(chart);
        else if (animState.animationFrameId && outerRadius <= 0 && animState.waves.length === 0) _stopWaveAnimation(chart);

        const { ctx } = chart;
        ctx.save();
        if (outerRadius > 0 && centerX && centerY) {
            ctx.beginPath();
            ctx.rect(0, 0, chart.width, chart.height);
            ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2, true); 
            ctx.clip('evenodd'); 
        }
        animState.waves.forEach(wave => {
            if (wave.radius > (outerRadius + 3) && wave.opacity > 0 && centerX && centerY) {
                ctx.beginPath(); 
                ctx.arc(centerX, centerY, wave.radius, 0, Math.PI * 2, false);
                ctx.fillStyle = `rgba(${animState.config.BASE_COLOR_RGB_TRIPLET}, ${wave.opacity})`;
                ctx.fill();
            }
        });
        ctx.restore();
    }
};
