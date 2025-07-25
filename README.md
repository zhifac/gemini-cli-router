# Gemini CLI Router

[中文版](https://github.com/zhifac/gemini-cli-router/blob/master/README.zh-CN.md)
This tool acts as a proxy to route requests from the Gemini CLI to various OpenAI-compatible APIs, such as OpenAI, Azure OpenAI, and OpenRouter.

## Features

- **Seamless Integration**: Works with the existing `gemini` CLI without any modifications to the original tool.
- **Multi-Provider Support**: Configure multiple API providers and easily switch between them.
- **Request/Response Logging**: Detailed logging of all requests and responses for easy debugging.
- **Passthrough Mode**: Bypass all transformations to use the tool as a pure request logger.

## Installation

### Option1: install via npm

```bash
npm install -g @zhifac/gemini-cli-router
```

### Option2: install from source

1.  Clone this repository.
2.  Install the dependencies:
    ```bash
    npm install --prefix gemini-cli-router
    ```

## Configuration

1.  Copy the sample configuration file:
    ```bash
    cp gemini-cli-router/router-config.json.sample ~/.gemini-cli-router/router-config.json
    ```
2.  Edit `~/.gemini-cli-router/router-config.json` to add your API credentials. You can configure multiple providers and set one as the default.

### Configuration Options

-   `default`: The name of the provider to use by default.
-   `providers`: An object containing the configuration for each provider.

#### Standard Provider (OpenAI, OpenRouter, etc.)

-   `api_key`: Your API key.
-   `base_url`: The base URL of the API.
-   `model`: The name of the model to use.

#### Azure OpenAI Provider

-   `is_azure`: Set to `true`.
-   `api_key`: Your Azure API key.
-   `base_url`: The base URL of your Azure resource (e.g., `https://YOUR_RESOURCE_NAME.openai.azure.com/`).
-   `azure_deployment_name`: The name of your deployment.
-   `azure_api_version`: The API version to use (e.g., `2024-02-01`).

## Usage

Run the Gemini CLI through the router:

```bash
# Option1: run with npm install
gemini-cli-router

# Option2: run from source
node gemini-cli-router/cli.js
```

**Note**: if you are prompted to select auth method, choose `Use Gemini API`.

To enable debug logging, use the `--debug` flag:

```bash
gemini-cli-router --debug

OR

node gemini-cli-router/cli.js --debug
```

### Passthrough Mode

To disable all request and response transformations and use the router as a pure logger, use the `--passthrough` flag. Note that you must also enable debug logging to see the output.

```bash
gemini-cli-router --debug --passthrough

OR

node gemini-cli-router/cli.js --debug --passthrough
```

### `GEMINI_CLI_PATH` Environment Variable

By default, the router will attempt to find the `gemini` executable in your system's PATH. If you have installed the Gemini CLI in a custom location, you can specify the path to the executable using the `GEMINI_CLI_PATH` environment variable.

```bash
GEMINI_CLI_PATH=/path/to/your/gemini node gemini-cli-router/cli.js
```

## Logging

When the `--debug` flag is enabled, all requests and responses are logged to `gemini-cli-router.log` in the current working directory.
