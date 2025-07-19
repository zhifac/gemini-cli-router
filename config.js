import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_PATH = path.join(os.homedir(), '.gemini', 'openai-proxy-config.json');

export function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`Configuration file not found at ${CONFIG_PATH}`);
    console.error('Please create it based on the router-config.json.sample file.');
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

  if (!config.default || !config.providers || !config.providers[config.default]) {
    console.error(`Invalid configuration in ${CONFIG_PATH}`);
    console.error('Please ensure it contains a 'default' provider and a 'providers' object with the default provider defined.');
    process.exit(1);
  }

  const activeProvider = config.providers[config.default];

  if (activeProvider.is_azure) {
    if (!activeProvider.api_key || !activeProvider.base_url || !activeProvider.azure_deployment_name || !activeProvider.azure_api_version) {
      console.error(`Invalid Azure provider in ${CONFIG_PATH}`);
      console.error('Please ensure the active Azure provider contains api_key, base_url, azure_deployment_name, and azure_api_version.');
      process.exit(1);
    }
  } else {
    if (!activeProvider.api_key || !activeProvider.base_url || !activeProvider.model) {
      console.error(`Invalid standard provider in ${CONFIG_PATH}`);
      console.error('Please ensure the active provider contains api_key, base_url, and model.');
      process.exit(1);
    }
  }

  console.log(`[Router] Using '${config.default}' provider.`);
  return activeProvider;
}
