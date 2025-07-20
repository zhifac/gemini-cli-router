import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'gemini-cli-router.log');
const DEBUG_ENABLED = process.env.GEMINI_ROUTER_DEBUG === 'true';

// Clear the log file on startup if debug is enabled.
if (DEBUG_ENABLED) {
    fs.writeFileSync(LOG_FILE, '');
}

function writeToLog(title, details) {
  const timestamp = new Date().toISOString();
  let logEntry = `--- ${timestamp} --- ${title} ---\n`;

  if (details.url) {
    logEntry += `URL: ${details.url}\n`;
  }
  if (details.headers) {
    logEntry += `Headers: ${JSON.stringify(details.headers, null, 2)}\n`;
  }
  if (details.body) {
    try {
        const parsedBody = typeof details.body === 'string' ? JSON.parse(details.body) : details.body;
        logEntry += `Body: ${JSON.stringify(parsedBody, null, 2)}\n`;
    } catch (e) {
        logEntry += `Body (raw): ${details.body}\n`;
    }
  }
  if (details.request_body) {
    logEntry += `Request Body: ${JSON.stringify(details.request_body, null, 2)}\n`;
  }
  logEntry += `--- End of ${title} ---\n\n`;

  fs.appendFileSync(LOG_FILE, logEntry);
}

export function logRequestDetails(title, details) {
  if (!DEBUG_ENABLED) return;
  writeToLog(title, details);
  console.log(`[Proxy Debug] Logged ${title} to openai-proxy-debug.log`);
}

export function logError(title, details) {
    writeToLog(title, details);
    console.error(`[Proxy] Logged ${title} to gemini-cli-router.log`);
}