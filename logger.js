import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'gemini-cli-router.log');
const DEBUG_ENABLED = process.env.GEMINI_ROUTER_DEBUG === 'true';

// Clear the log file on startup if debug is enabled.
if (DEBUG_ENABLED) {
    fs.writeFileSync(LOG_FILE, '');
}

export function logRequestDetails(title, details) {
  if (!DEBUG_ENABLED) return;

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
  logEntry += `--- End of ${title} ---\n\n`;

  fs.appendFileSync(LOG_FILE, logEntry);
  console.log(`[Proxy Debug] Logged ${title} to openai-proxy-debug.log`);
}
