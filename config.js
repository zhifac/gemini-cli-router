import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_PATH = path.join(os.homedir(), '.gemini', 'openai-proxy-config.json');

export function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`Configuration file not found at ${CONFIG_PATH}`);
    console.error('Please create it based on the openai-proxy-config.json.sample file.');
    process.exit(1);
  }

  // Read and remove comments before parsing
  const fileContent = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const uncommentedContent = fileContent.replace(/\"\/\/.*/g, '');
  const config = JSON.parse(uncommentedContent);

  // Check for Azure configuration
  if (config.azure_deployment_name) {
    if (!config.api_key || !config.base_url || !config.azure_api_version) {
      console.error(`Invalid Azure OpenAI configuration in ${CONFIG_PATH}`);
      console.error('Please ensure api_key, base_url, azure_deployment_name, and azure_api_version are provided for Azure.');
      process.exit(1);
    }
    config.is_azure = true;
    console.log("Azure OpenAI configuration loaded.");
  } else {
    // Standard OpenAI/compatible configuration
    if (!config.api_key || !config.base_url || !config.model) {
      console.error(`Invalid Standard OpenAI configuration in ${CONFIG_PATH}`);
      console.error('Please ensure api_key, base_url, and model are provided.');
      process.exit(1);
    }
    config.is_azure = false;
    console.log("Standard OpenAI configuration loaded.");
  }

  if (config.is_claude) {
      console.log("Claude AI configuration loaded.");
  }

  return config;
}
