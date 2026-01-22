const { spawn } = require('child_process');

// Configuration
const SCRIPT_NAME = 'add_to_cart_mbi.js';
const INTERVAL_MINUTES = 1;
const INTERVAL_MS = INTERVAL_MINUTES * 60 * 1000;

function runAutomation() {
    console.log(`\n[${new Date().toLocaleTimeString()}] ➤ Starting automation: ${SCRIPT_NAME}`);

    // Spawn the process
    const process = spawn('node', [SCRIPT_NAME], { stdio: 'inherit', shell: true });

    process.on('close', (code) => {
        console.log(`[${new Date().toLocaleTimeString()}] ➤ Script finished with code ${code}.`);
        console.log(`Waiting ${INTERVAL_MINUTES} minutes for next run...`);
    });

    process.on('error', (err) => {
        console.error('Failed to start script:', err);
    });
}

// Run immediately
runAutomation();

// Schedule repeated runs
setInterval(runAutomation, INTERVAL_MS);
