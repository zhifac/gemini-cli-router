import fs from 'fs';
import path from 'path';

// Log file will be created in the directory where the proxy is run.
const LOG_FILE = path.join(process.cwd(), 'openai-proxy-debug.log');

// Clear the log file on startup to keep it clean for each session.
fs.writeFileSync(LOG_FILE, '');

export function logRequestDetails(title, details) {
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
