# Gemini CLI LLM路由

本工具作为一个代理，将来自 Gemini CLI 的请求路由到各种与 OpenAI 兼容的 API，例如 OpenAI、Azure OpenAI 和 OpenRouter。

## 功能

- **无缝集成**: 可与现有的 `gemini` CLI 配合使用，无需对原始工具进行任何修改。
- **多提供商支持**: 可配置多个 API 提供商，并轻松地在它们之间切换。
- **请求/响应日志**: 详细记录所有请求和响应，便于调试。
- **直通模式**: 绕过所有转换，将本工具用作纯粹的请求记录器。

## 安装

1.  克隆本仓库。
2.  安装依赖：
    ```bash
    npm install --prefix gemini-cli-router
    ```

## 配置

1.  复制示例配置文件：
    ```bash
    cp gemini-cli-router/router-config.json.sample ~/.gemini-cli-router/router-config.json
    ```
2.  编辑 `~/.gemini/router-config.json` 文件，添加您的 API 凭据。您可以配置多个提供商，并设置一个为默认提供商。

### 配置选项

-   `default`: 默认使用的提供商名称。
-   `providers`: 包含每个提供商配置的对象。

#### 标准提供商 (OpenAI, OpenRouter 等)

-   `api_key`: 您的 API 密钥。
-   `base_url`: API 的基础 URL。
-   `model`: 要使用的模型名称。

#### Azure OpenAI 提供商

-   `is_azure`: 设置为 `true`。
-   `api_key`: 您的 Azure API 密钥。
-   `base_url`: 您的 Azure 资源的基础 URL (例如, `https://YOUR_RESOURCE_NAME.openai.azure.com/`)。
-   `azure_deployment_name`: 您的部署名称。
-   `azure_api_version`: 要使用的 API 版本 (例如, `2024-02-01`)。

## 使用

通过路由器运行 Gemini CLI：

```bash
node gemini-cli-router/cli.js
```

要启用调试日志，请使用 `--debug` 标志：

```bash
node gemini-cli-router/cli.js --debug
```

### 直通模式

要禁用所有请求和响应转换，并将路由器用作纯粹的记录器，请使用 `--passthrough` 标志。请注意，您还必须启用调试日志才能看到输出。

```bash
node gemini-cli-router/cli.js --debug --passthrough
```

## 日志

启用 `--debug` 标志后，所有请求和响应都将记录到当前工作目录下的 `gemini-cli-router.log` 文件中。
