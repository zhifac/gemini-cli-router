#!/usr/bin/env node

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const interceptorLoader = path.join(__dirname, 'interceptor-loader.js');

import { spawnSync } from 'child_process';

function findGeminiExecutable() {
    try {
        const result = spawnSync('which', ['gemini'], { stdio: 'pipe', encoding: 'utf-8' });
        if (result.status === 0) {
            return result.stdout.trim();
        }
    } catch (error) {
        // ignore
    }
    return null;
}

let geminiCLIPath = findGeminiExecutable();

if (process.env.GEMINI_CLI_PATH) {
    geminiCLIPath = process.env.GEMINI_CLI_PATH;
    console.log(`Using GEMINI_CLI_PATH: ${geminiCLIPath}`)
}

if (!geminiCLIPath) {
    console.error('Could not find the gemini cli executable in your PATH');
    process.exit(1);
}

const args = process.argv.slice(2);
const passthroughIndex = args.indexOf('--passthrough');
let passthrough = false;

if (passthroughIndex > -1) {
    passthrough = true;
    args.splice(passthroughIndex, 1);
}

const debugIndex = args.indexOf('--debug');
let debug = false;
if (debugIndex > -1) {
    debug = true;
    args.splice(debugIndex, 1);
}

const env = {
    ...process.env,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'any_value'
};

if (passthrough) {
    env.GEMINI_PROXY_PASSTHROUGH = 'true';
    console.log('[Proxy] Passthrough mode enabled. Transformations are disabled.');
}

if (debug) {
    env.GEMINI_ROUTER_DEBUG = 'true';
    console.log('[Router] Debug mode enabled. Logging to gemini-cli-router.log');
}

const child = spawn('node', [
    '--import',
    interceptorLoader,
    geminiCLIPath,
    ...args
], {
    stdio: 'inherit',
    env: env
});

child.on('exit', (code) => {
    process.exit(code);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Proxy] Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
