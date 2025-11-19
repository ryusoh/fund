/**
 * Matrix Digital Rain Effect
 *
 * Renders falling code streams on the background canvas.
 */

const canvas = document.getElementById('holo-bg');
const ctx = canvas.getContext('2d');

let width, height;
let columns;
const fontSize = 14;
const drops = [];

// Matrix characters (Katakana + Latin + Numbers)
const chars =
    'アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function resize() {
    canvas.width = window.innerWidth;
    width = canvas.width;
    canvas.height = window.innerHeight;
    height = canvas.height;

    columns = Math.floor(width / fontSize);

    // Reset drops if size changes significantly
    if (drops.length !== columns) {
        drops.length = 0;
        for (let i = 0; i < columns; i++) {
            drops[i] = Math.random() * -100; // Start above screen randomly
        }
    }
}

function draw() {
    // Semi-transparent black to create trail effect
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#0F0'; // Matrix Green
    ctx.font = `${fontSize}px monospace`;

    for (let i = 0; i < drops.length; i++) {
        // Random character
        const text = chars.charAt(Math.floor(Math.random() * chars.length));

        // x = column index * font size, y = drop value * font size
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);

        // Reset drop to top randomly after it crosses screen
        // Adding randomness to reset makes drops scatter
        if (drops[i] * fontSize > height && Math.random() > 0.975) {
            drops[i] = 0;
        }

        // Increment y coordinate
        drops[i]++;
    }

    requestAnimationFrame(draw);
}

// Init
window.addEventListener('resize', resize);
resize();
draw();
