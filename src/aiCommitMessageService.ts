import * as vscode from "vscode";
import { configuration } from "./helpers/configuration";
import { Repository } from "./repository";
import { Resource } from "./resource";

type CommitMessageGenerationMode = "auto" | "ai" | "template";
export type CommitMessageAIProvider =
  | "vscode-lm"
  | "openai-compatible"
  | "azure-openai";
export type OpenAICompatibleApiType = "auto" | "responses" | "chat-completions";
export type AzureOpenAIApiType = "responses" | "chat-completions";

type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  }
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

type FetchLikeResponse = Awaited<ReturnType<FetchLike>>;

interface OpenAICompatibleProviderOptions {
  baseUrl?: string;
  model?: string;
  apiType?: OpenAICompatibleApiType;
}

interface LanguageModelApi {
  lm?: {
    selectChatModels?: (
      selector?: LanguageModelSelector
    ) => Promise<LanguageModelChat[]>;
  };
  LanguageModelChatMessage?: {
    User: (content: string) => unknown;
  };
}

interface LanguageModelSelector {
  vendor?: string;
  family?: string;
  version?: string;
  id?: string;
}

interface LanguageModelChat {
  sendRequest: (
    messages: unknown[],
    options?: { justification?: string },
    token?: vscode.CancellationToken
  ) => Promise<LanguageModelResponse>;
}

interface LanguageModelResponse {
  stream: AsyncIterable<
    LanguageModelResponsePart | LanguageModelResponsePart[]
  >;
}

interface LanguageModelResponsePart {
  value?: unknown;
}

interface CommitMessagePromptContext {
  repository: Repository;
  resources: Resource[];
  fallbackMessage: string;
  diff?: string;
}

interface CommitMessageProvider {
  generate(
    prompt: string,
    token?: vscode.CancellationToken
  ): Promise<CommitMessageAIResult>;
}

export interface CommitMessageAIResult {
  message?: string;
  reason?: "no-api" | "no-model" | "missing-api-key" | "http-error" | "error";
  error?: unknown;
}

const OPENAI_COMPATIBLE_API_KEY_SECRET =
  "svn.commitMessageGeneration.openaiCompatible.apiKey";
const AZURE_OPENAI_API_KEY_SECRET =
  "svn.commitMessageGeneration.azureOpenAI.apiKey";

let extensionSecrets: vscode.SecretStorage | undefined;

export function setCommitMessageSecretStorage(
  secrets: vscode.SecretStorage
): void {
  extensionSecrets = secrets;
}

function getDefaultFetchImplementation(): FetchLike {
  const globalFetch = (globalThis as { fetch?: FetchLike }).fetch;
  if (!globalFetch) {
    throw new Error("Fetch API is not available in this environment.");
  }

  return globalFetch;
}

export async function storeOpenAICompatibleApiKey(
  apiKey: string
): Promise<void> {
  if (!extensionSecrets) {
    throw new Error("Secret storage is not available.");
  }

  await extensionSecrets.store(OPENAI_COMPATIBLE_API_KEY_SECRET, apiKey);
}

export async function deleteOpenAICompatibleApiKey(): Promise<void> {
  if (!extensionSecrets) {
    throw new Error("Secret storage is not available.");
  }

  await extensionSecrets.delete(OPENAI_COMPATIBLE_API_KEY_SECRET);
}

export async function storeAzureOpenAIApiKey(apiKey: string): Promise<void> {
  if (!extensionSecrets) {
    throw new Error("Secret storage is not available.");
  }

  await extensionSecrets.store(AZURE_OPENAI_API_KEY_SECRET, apiKey);
}

export async function deleteAzureOpenAIApiKey(): Promise<void> {
  if (!extensionSecrets) {
    throw new Error("Secret storage is not available.");
  }

  await extensionSecrets.delete(AZURE_OPENAI_API_KEY_SECRET);
}

export async function hasAzureOpenAIApiKey(): Promise<boolean> {
  if (!extensionSecrets) {
    return false;
  }

  return Boolean(await extensionSecrets.get(AZURE_OPENAI_API_KEY_SECRET));
}

export async function hasOpenAICompatibleApiKey(): Promise<boolean> {
  if (!extensionSecrets) {
    return false;
  }

  return Boolean(await extensionSecrets.get(OPENAI_COMPATIBLE_API_KEY_SECRET));
}

async function getOpenAICompatibleApiKey(): Promise<string | undefined> {
  if (!extensionSecrets) {
    return;
  }

  return extensionSecrets.get(OPENAI_COMPATIBLE_API_KEY_SECRET);
}

async function getAzureOpenAIApiKey(): Promise<string | undefined> {
  if (!extensionSecrets) {
    return;
  }

  return extensionSecrets.get(AZURE_OPENAI_API_KEY_SECRET);
}

function getLanguageModelApi(): LanguageModelApi {
  return (vscode as unknown) as LanguageModelApi;
}

function getOutputLanguageInstruction(): string {
  const language = configuration.get<string>(
    "commitMessageGeneration.outputLanguage",
    "auto"
  );
  const editorLanguage = vscode.env.language.toLowerCase();

  switch (language) {
    case "en":
      return vscode.l10n.t("Write the commit message in English.");
    case "ko":
      return vscode.l10n.t("Write the commit message in Korean.");
    case "ja":
      return vscode.l10n.t("Write the commit message in Japanese.");
    case "zh-CN":
      return vscode.l10n.t("Write the commit message in Simplified Chinese.");
    case "zh-TW":
      return vscode.l10n.t("Write the commit message in Traditional Chinese.");
    default:
      if (editorLanguage === "ko" || editorLanguage.startsWith("ko-")) {
        return vscode.l10n.t("Write the commit message in Korean.");
      }

      if (editorLanguage === "ja" || editorLanguage.startsWith("ja-")) {
        return vscode.l10n.t("Write the commit message in Japanese.");
      }

      if (editorLanguage === "zh-tw" || editorLanguage.startsWith("zh-hant")) {
        return vscode.l10n.t(
          "Write the commit message in Traditional Chinese."
        );
      }

      if (editorLanguage === "zh-cn" || editorLanguage.startsWith("zh-hans")) {
        return vscode.l10n.t("Write the commit message in Simplified Chinese.");
      }

      return vscode.l10n.t("Write the commit message in English.");
  }
}

function getResourceSummary(
  repository: Repository,
  resources: Resource[]
): string {
  return resources
    .map(resource => {
      const relativePath = repository.repository.removeAbsolutePath(
        resource.resourceUri.fsPath
      );
      const renameFrom = resource.renameResourceUri
        ? repository.repository.removeAbsolutePath(
            resource.renameResourceUri.fsPath
          )
        : undefined;
      const parts = [resource.letter || "?", relativePath];

      if (renameFrom) {
        parts.push(`(${vscode.l10n.t("from {0}", renameFrom)})`);
      }

      return `- ${parts.join(" ")}`;
    })
    .join("\n");
}

function trimDiff(diff: string): string {
  const maxCharacters = configuration.get<number>(
    "commitMessageGeneration.maxDiffCharacters",
    12000
  );

  if (diff.length <= maxCharacters) {
    return diff;
  }

  return `${diff.slice(0, maxCharacters)}\n\n${vscode.l10n.t(
    "[Diff truncated]"
  )}`;
}

async function getDiffContext(
  repository: Repository,
  resources: Resource[]
): Promise<string | undefined> {
  const includeDiff = configuration.get<boolean>(
    "commitMessageGeneration.includeDiff",
    true
  );

  if (!includeDiff || resources.length === 0) {
    return;
  }

  const diffFiles = resources.map(resource => resource.resourceUri.fsPath);
  const diff = await repository.patch(diffFiles);

  if (!diff.trim()) {
    return;
  }

  return trimDiff(diff);
}

async function selectModel(): Promise<LanguageModelChat | undefined> {
  const vscodeApi = getLanguageModelApi();
  const selectChatModels = vscodeApi.lm?.selectChatModels;

  if (!selectChatModels) {
    return;
  }

  const preferredVendor = configuration.get<string | null>(
    "commitMessageGeneration.vscodeLM.preferredVendor",
    configuration.get<string | null>(
      "commitMessageGeneration.preferredVendor",
      null
    )
  );
  const preferredModelFamily = configuration.get<string | null>(
    "commitMessageGeneration.vscodeLM.preferredModelFamily",
    configuration.get<string | null>(
      "commitMessageGeneration.preferredModelFamily",
      null
    )
  );
  const preferredModelVersion = configuration.get<string | null>(
    "commitMessageGeneration.vscodeLM.preferredModelVersion",
    configuration.get<string | null>(
      "commitMessageGeneration.preferredModelVersion",
      "raptor-mini"
    )
  );

  const preferredSelectors: LanguageModelSelector[] = [];

  if (preferredVendor && preferredModelFamily && preferredModelVersion) {
    preferredSelectors.push({
      vendor: preferredVendor,
      family: preferredModelFamily,
      version: preferredModelVersion
    });
  }

  if (preferredVendor && preferredModelVersion) {
    preferredSelectors.push({
      vendor: preferredVendor,
      version: preferredModelVersion
    });
  }

  if (preferredModelFamily && preferredModelVersion) {
    preferredSelectors.push({
      family: preferredModelFamily,
      version: preferredModelVersion
    });
  }

  if (preferredVendor && preferredModelFamily) {
    preferredSelectors.push({
      vendor: preferredVendor,
      family: preferredModelFamily
    });
  }

  if (preferredModelVersion) {
    preferredSelectors.push({ version: preferredModelVersion });
  }

  if (preferredModelFamily) {
    preferredSelectors.push({ family: preferredModelFamily });
  }

  if (preferredVendor) {
    preferredSelectors.push({ vendor: preferredVendor });
  }

  for (const selector of preferredSelectors) {
    const preferredModels = await selectChatModels(selector);
    if (preferredModels.length > 0) {
      return preferredModels[0];
    }
  }

  const copilotModels = await selectChatModels({ vendor: "copilot" });
  if (copilotModels.length > 0) {
    return copilotModels[0];
  }

  const models = await selectChatModels({});
  return models[0];
}

async function readResponseText(
  response: LanguageModelResponse
): Promise<string> {
  let text = "";

  for await (const chunk of response.stream) {
    const parts = Array.isArray(chunk) ? chunk : [chunk];

    for (const part of parts) {
      if (typeof part?.value === "string") {
        text += part.value;
      }
    }
  }

  return text.trim();
}

function looksLikeReasoningLine(line: string): boolean {
  const normalized = line.trim();

  if (!normalized) {
    return false;
  }

  if (/^\*\*[^*]+\*\*$/.test(normalized)) {
    return true;
  }

  if (/^(i|we)'m\s+/i.test(normalized)) {
    return true;
  }

  return /^(i|we)\s+(need to|should|will|want to|am|have to)\b/i.test(
    normalized
  );
}

function sanitizeCommitMessageResponse(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").trim();

  if (!normalized) {
    return "";
  }

  const lines = normalized.split("\n");
  let startIndex = 0;

  while (startIndex < lines.length) {
    const line = lines[startIndex].trim();

    if (!line) {
      startIndex += 1;
      continue;
    }

    if (looksLikeReasoningLine(line)) {
      startIndex += 1;
      continue;
    }

    break;
  }

  const sanitized = lines.slice(startIndex).join("\n").trim();
  return sanitized || normalized;
}

function buildPrompt({
  repository,
  resources,
  fallbackMessage,
  diff
}: CommitMessagePromptContext): string {
  const summary = getResourceSummary(repository, resources);
  const diffSection = diff
    ? `\n${vscode.l10n.t("Unified diff (possibly truncated):")}\n${diff}`
    : `\n${vscode.l10n.t("No diff content was available.")}`;

  return [
    vscode.l10n.t("You generate SVN commit messages."),
    getOutputLanguageInstruction(),
    vscode.l10n.t("Return only the final commit message text."),
    vscode.l10n.t("Use an imperative subject line and keep it concise."),
    vscode.l10n.t(
      "Add a blank line and a short body only when it adds real value."
    ),
    vscode.l10n.t(
      "Do not invent changes that are not present in the provided context."
    ),
    "",
    vscode.l10n.t("Changed files:"),
    summary,
    "",
    vscode.l10n.t("Template fallback draft:"),
    fallbackMessage,
    diffSection
  ].join("\n");
}

class VscodeLanguageModelCommitMessageProvider
  implements CommitMessageProvider {
  public async generate(
    prompt: string,
    token?: vscode.CancellationToken
  ): Promise<CommitMessageAIResult> {
    const vscodeApi = getLanguageModelApi();

    if (
      typeof vscodeApi.lm?.selectChatModels !== "function" ||
      typeof vscodeApi.LanguageModelChatMessage?.User !== "function"
    ) {
      return { reason: "no-api" };
    }

    try {
      const model = await selectModel();
      if (!model) {
        return { reason: "no-model" };
      }

      const response = await model.sendRequest(
        [vscodeApi.LanguageModelChatMessage.User(prompt)],
        {
          justification: vscode.l10n.t(
            "Generate an SVN commit message from the current working copy changes."
          )
        },
        token
      );

      const message = sanitizeCommitMessageResponse(
        await readResponseText(response)
      );

      if (!message) {
        return { reason: "error" };
      }

      return { message };
    } catch (error) {
      return { reason: "error", error };
    }
  }
}

function getOpenAICompatibleProviderBaseUrl(): string {
  return configuration
    .get<string>("commitMessageGeneration.openAICompatible.baseUrl", "")
    .trim()
    .replace(/\/$/, "");
}

function getOpenAICompatibleProviderModel(): string {
  return configuration
    .get<string>("commitMessageGeneration.openAICompatible.model", "")
    .trim();
}

function getOpenAICompatibleApiType(): OpenAICompatibleApiType {
  return configuration.get<OpenAICompatibleApiType>(
    "commitMessageGeneration.openAICompatible.apiType",
    "auto"
  );
}

function getCommitMessageGenerationTimeout(): number {
  return configuration.get<number>("commitMessageGeneration.timeout", 30000);
}

function getAzureOpenAIEndpoint(): string {
  return configuration
    .get<string>("commitMessageGeneration.azureOpenAI.endpoint", "")
    .trim()
    .replace(/\/$/, "");
}

function getAzureOpenAIDeployment(): string {
  return configuration
    .get<string>("commitMessageGeneration.azureOpenAI.deployment", "")
    .trim();
}

function getAzureOpenAIApiVersion(): string {
  return configuration
    .get<string>("commitMessageGeneration.azureOpenAI.apiVersion", "2024-10-21")
    .trim();
}

function getAzureOpenAIApiType(): AzureOpenAIApiType {
  return configuration.get<AzureOpenAIApiType>(
    "commitMessageGeneration.azureOpenAI.apiType",
    "chat-completions"
  );
}

function getOpenAICompatibleHeaders(): Record<string, string> {
  const organization = configuration
    .get<string | null>(
      "commitMessageGeneration.openAICompatible.organization",
      null
    )
    ?.trim();
  const project = configuration
    .get<string | null>(
      "commitMessageGeneration.openAICompatible.project",
      null
    )
    ?.trim();
  const headers: Record<string, string> = {};

  if (organization) {
    headers["OpenAI-Organization"] = organization;
  }

  if (project) {
    headers["OpenAI-Project"] = project;
  }

  return headers;
}

async function parseJsonResponse(response: FetchLikeResponse): Promise<any> {
  const text = await response.text();

  if (!text.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function extractResponsesApiText(payload: any): string {
  if (typeof payload?.output_text === "string") {
    return payload.output_text;
  }

  const output = Array.isArray(payload?.output) ? payload.output : [];
  const textParts: string[] = [];

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === "string") {
        textParts.push(part.text);
      }
    }
  }

  return textParts.join("\n").trim();
}

function extractChatCompletionsText(payload: any): string {
  const choices = Array.isArray(payload?.choices) ? payload.choices : [];
  const firstChoice = choices[0];
  const content = firstChoice?.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map(part => (typeof part?.text === "string" ? part.text : ""))
      .join("\n")
      .trim();
  }

  return "";
}

class OpenAICompatibleCommitMessageProvider implements CommitMessageProvider {
  constructor(
    private readonly fetchFn: FetchLike = getDefaultFetchImplementation(),
    private readonly options?: OpenAICompatibleProviderOptions
  ) {}

  private getBaseUrl(): string {
    return this.options?.baseUrl ?? getOpenAICompatibleProviderBaseUrl();
  }

  private getModel(): string {
    return this.options?.model ?? getOpenAICompatibleProviderModel();
  }

  private getApiType(): OpenAICompatibleApiType {
    return this.options?.apiType ?? getOpenAICompatibleApiType();
  }

  private async postJson(
    path: string,
    body: unknown,
    token?: vscode.CancellationToken
  ): Promise<{ ok: boolean; status: number; payload: any }> {
    const apiKey = await getOpenAICompatibleApiKey();
    if (!apiKey) {
      return { ok: false, status: 401, payload: { reason: "missing-api-key" } };
    }

    const baseUrl = this.getBaseUrl();
    const controller = new AbortController();
    const timeoutHandle = setTimeout(
      () => controller.abort(),
      getCommitMessageGenerationTimeout()
    );

    if (token) {
      token.onCancellationRequested(() => controller.abort());
    }

    try {
      const response = await this.fetchFn(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...getOpenAICompatibleHeaders()
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      return {
        ok: response.ok,
        status: response.status,
        payload: await parseJsonResponse(response)
      };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private async generateWithResponsesApi(
    prompt: string,
    token?: vscode.CancellationToken
  ): Promise<CommitMessageAIResult> {
    const model = this.getModel();
    const result = await this.postJson(
      "/responses",
      {
        model,
        input: prompt
      },
      token
    );

    if (!result.ok) {
      return {
        reason:
          result.payload?.reason === "missing-api-key"
            ? "missing-api-key"
            : "http-error",
        error: result.payload
      };
    }

    const message = sanitizeCommitMessageResponse(
      extractResponsesApiText(result.payload)
    );

    return message ? { message } : { reason: "error", error: result.payload };
  }

  private async generateWithChatCompletions(
    prompt: string,
    token?: vscode.CancellationToken
  ): Promise<CommitMessageAIResult> {
    const model = this.getModel();
    const result = await this.postJson(
      "/chat/completions",
      {
        model,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      },
      token
    );

    if (!result.ok) {
      return {
        reason:
          result.payload?.reason === "missing-api-key"
            ? "missing-api-key"
            : "http-error",
        error: result.payload
      };
    }

    const message = sanitizeCommitMessageResponse(
      extractChatCompletionsText(result.payload)
    );

    return message ? { message } : { reason: "error", error: result.payload };
  }

  public async generate(
    prompt: string,
    token?: vscode.CancellationToken
  ): Promise<CommitMessageAIResult> {
    const baseUrl = this.getBaseUrl();
    const model = this.getModel();

    if (!baseUrl || !model) {
      return { reason: "error" };
    }

    const apiType = this.getApiType();

    if (apiType === "responses") {
      return this.generateWithResponsesApi(prompt, token);
    }

    if (apiType === "chat-completions") {
      return this.generateWithChatCompletions(prompt, token);
    }

    const responsesResult = await this.generateWithResponsesApi(prompt, token);
    if (responsesResult.message) {
      return responsesResult;
    }

    if (responsesResult.reason === "missing-api-key") {
      return responsesResult;
    }

    return this.generateWithChatCompletions(prompt, token);
  }
}

class AzureOpenAICommitMessageProvider implements CommitMessageProvider {
  constructor(
    private readonly fetchFn: FetchLike = getDefaultFetchImplementation()
  ) {}

  private async postJson(
    path: string,
    body: unknown,
    token?: vscode.CancellationToken
  ): Promise<{ ok: boolean; status: number; payload: any }> {
    const apiKey = await getAzureOpenAIApiKey();
    if (!apiKey) {
      return { ok: false, status: 401, payload: { reason: "missing-api-key" } };
    }

    const endpoint = getAzureOpenAIEndpoint();
    const controller = new AbortController();
    const timeoutHandle = setTimeout(
      () => controller.abort(),
      getCommitMessageGenerationTimeout()
    );

    if (token) {
      token.onCancellationRequested(() => controller.abort());
    }

    try {
      const response = await this.fetchFn(`${endpoint}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": apiKey
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      return {
        ok: response.ok,
        status: response.status,
        payload: await parseJsonResponse(response)
      };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private getDeploymentPath(apiPath: string): string {
    const deployment = getAzureOpenAIDeployment();
    const apiVersion = getAzureOpenAIApiVersion();
    return `/openai/deployments/${deployment}${apiPath}?api-version=${apiVersion}`;
  }

  private async generateWithResponsesApi(
    prompt: string,
    token?: vscode.CancellationToken
  ): Promise<CommitMessageAIResult> {
    const result = await this.postJson(
      this.getDeploymentPath("/responses"),
      {
        input: prompt
      },
      token
    );

    if (!result.ok) {
      return {
        reason:
          result.payload?.reason === "missing-api-key"
            ? "missing-api-key"
            : "http-error",
        error: result.payload
      };
    }

    const message = sanitizeCommitMessageResponse(
      extractResponsesApiText(result.payload)
    );

    return message ? { message } : { reason: "error", error: result.payload };
  }

  private async generateWithChatCompletions(
    prompt: string,
    token?: vscode.CancellationToken
  ): Promise<CommitMessageAIResult> {
    const result = await this.postJson(
      this.getDeploymentPath("/chat/completions"),
      {
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      },
      token
    );

    if (!result.ok) {
      return {
        reason:
          result.payload?.reason === "missing-api-key"
            ? "missing-api-key"
            : "http-error",
        error: result.payload
      };
    }

    const message = sanitizeCommitMessageResponse(
      extractChatCompletionsText(result.payload)
    );

    return message ? { message } : { reason: "error", error: result.payload };
  }

  public async generate(
    prompt: string,
    token?: vscode.CancellationToken
  ): Promise<CommitMessageAIResult> {
    const endpoint = getAzureOpenAIEndpoint();
    const deployment = getAzureOpenAIDeployment();

    if (!endpoint || !deployment) {
      return { reason: "error" };
    }

    return getAzureOpenAIApiType() === "responses"
      ? this.generateWithResponsesApi(prompt, token)
      : this.generateWithChatCompletions(prompt, token);
  }
}

async function generateOpenAICompatibleCommitMessageForTests(
  prompt: string,
  options: {
    apiKey?: string;
    baseUrl: string;
    model: string;
    apiType: OpenAICompatibleApiType;
    timeout?: number;
    organization?: string | null;
    project?: string | null;
    fetchFn: FetchLike;
  }
): Promise<CommitMessageAIResult> {
  const originalSecrets = extensionSecrets;

  extensionSecrets = {
    get: async () => options.apiKey,
    store: async () => undefined,
    delete: async () => undefined,
    onDidChange: new vscode.EventEmitter<vscode.SecretStorageChangeEvent>()
      .event
  };

  try {
    return new OpenAICompatibleCommitMessageProvider(options.fetchFn, {
      baseUrl: options.baseUrl,
      model: options.model,
      apiType: options.apiType
    }).generate(prompt);
  } finally {
    extensionSecrets = originalSecrets;
  }
}

async function generateOpenAICompatibleFallbackCommitMessageForTests(
  prompt: string,
  options: {
    apiKey?: string;
    baseUrl: string;
    model: string;
    fetchFn: FetchLike;
  }
): Promise<CommitMessageAIResult> {
  const originalSecrets = extensionSecrets;

  extensionSecrets = {
    get: async () => options.apiKey,
    store: async () => undefined,
    delete: async () => undefined,
    onDidChange: new vscode.EventEmitter<vscode.SecretStorageChangeEvent>()
      .event
  };

  try {
    const responsesResult = await new OpenAICompatibleCommitMessageProvider(
      options.fetchFn,
      {
        baseUrl: options.baseUrl,
        model: options.model,
        apiType: "responses"
      }
    ).generate(prompt);

    if (
      responsesResult.message ||
      responsesResult.reason === "missing-api-key"
    ) {
      return responsesResult;
    }

    return new OpenAICompatibleCommitMessageProvider(options.fetchFn, {
      baseUrl: options.baseUrl,
      model: options.model,
      apiType: "chat-completions"
    }).generate(prompt);
  } finally {
    extensionSecrets = originalSecrets;
  }
}

function getCommitMessageAIProvider(): CommitMessageAIProvider {
  return configuration.get<CommitMessageAIProvider>(
    "commitMessageGeneration.provider",
    "vscode-lm"
  );
}

function createCommitMessageProvider(): CommitMessageProvider {
  switch (getCommitMessageAIProvider()) {
    case "openai-compatible":
      return new OpenAICompatibleCommitMessageProvider();
    case "azure-openai":
      return new AzureOpenAICommitMessageProvider();
    default:
      return new VscodeLanguageModelCommitMessageProvider();
  }
}

export function getCommitMessageGenerationMode(): CommitMessageGenerationMode {
  return configuration.get<CommitMessageGenerationMode>(
    "commitMessageGeneration.mode",
    "auto"
  );
}

export async function generateAICommitMessage(
  repository: Repository,
  resources: Resource[],
  fallbackMessage: string,
  token?: vscode.CancellationToken
): Promise<CommitMessageAIResult> {
  try {
    let diff: string | undefined;
    try {
      diff = await getDiffContext(repository, resources);
    } catch {
      diff = undefined;
    }

    const prompt = buildPrompt({
      repository,
      resources,
      fallbackMessage,
      diff
    });

    return createCommitMessageProvider().generate(prompt, token);
  } catch (error) {
    return { reason: "error", error };
  }
}

export const __test__ = {
  sanitizeCommitMessageResponse,
  extractResponsesApiText,
  extractChatCompletionsText,
  generateOpenAICompatibleCommitMessageForTests,
  generateOpenAICompatibleFallbackCommitMessageForTests
};
