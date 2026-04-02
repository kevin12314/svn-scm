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

interface CommitMessagePromptContext {
  repository: Repository;
  resources: Resource[];
  fallbackMessage: string;
  diff?: string;
  traceId?: string;
}

interface CommitMessageProvider {
  generate(
    prompt: string | CommitMessagePromptContext,
    token?: vscode.CancellationToken
  ): Promise<CommitMessageAIResult>;
}

export interface CommitMessageAIResult {
  message?: string;
  reason?: "no-model" | "missing-api-key" | "http-error" | "error";
  error?: unknown;
}

const OPENAI_COMPATIBLE_API_KEY_SECRET =
  "svn.commitMessageGeneration.openaiCompatible.apiKey";
const AZURE_OPENAI_API_KEY_SECRET =
  "svn.commitMessageGeneration.azureOpenAI.apiKey";

let extensionSecrets: vscode.SecretStorage | undefined;
let commitMessageOutputChannel: vscode.OutputChannel | undefined;

export function setCommitMessageSecretStorage(
  secrets: vscode.SecretStorage
): void {
  extensionSecrets = secrets;
}

export function setCommitMessageOutputChannel(
  outputChannel: vscode.OutputChannel
): void {
  commitMessageOutputChannel = outputChannel;
}

function logCommitMessageTrace(traceId: string, message: string): void {
  if (!commitMessageOutputChannel) {
    console.warn(
      `[commit-message:${traceId}] Output channel is not initialized; trace logging skipped.`
    );
    return;
  }

  commitMessageOutputChannel.appendLine(
    `[commit-message:${traceId}] ${message}`
  );
}

function getElapsedMilliseconds(startedAt: number): number {
  return Date.now() - startedAt;
}

interface PreferredModelCriteria {
  vendor?: string;
  family?: string;
  version?: string;
  id?: string;
}

const DEFAULT_VSCODE_LM_MODEL: Required<PreferredModelCriteria> = {
  id: "oswe-vscode-prime",
  vendor: "copilot",
  family: "oswe-vscode",
  version: "raptor-mini"
};

function describeModel(model: vscode.LanguageModelChat): string {
  return `id=${model.id} vendor=${model.vendor} family=${model.family} version=${model.version}`;
}

function getModelMatchScore(
  model: vscode.LanguageModelChat,
  criteria: PreferredModelCriteria
): number {
  let score = 0;

  if (criteria.id) {
    if (model.id !== criteria.id) {
      return -1;
    }

    score += 100;
  }

  if (criteria.vendor) {
    if (model.vendor !== criteria.vendor) {
      return -1;
    }

    score += 10;
  }

  if (criteria.family) {
    if (model.family !== criteria.family) {
      return -1;
    }

    score += 5;
  }

  if (criteria.version) {
    if (model.version !== criteria.version) {
      return -1;
    }

    score += 3;
  }

  return score;
}

function pickBestMatchingModel(
  models: readonly vscode.LanguageModelChat[],
  criteria: PreferredModelCriteria
): vscode.LanguageModelChat | undefined {
  let bestModel: vscode.LanguageModelChat | undefined;
  let bestScore = -1;

  for (const model of models) {
    const score = getModelMatchScore(model, criteria);

    if (score > bestScore) {
      bestModel = model;
      bestScore = score;
    }
  }

  return bestModel;
}

function getPreferredModelCriteria(): PreferredModelCriteria {
  const preferredVendor = configuration.get<string | null>(
    "commitMessageGeneration.vscodeLM.preferredVendor",
    null
  );
  const preferredModelFamily = configuration.get<string | null>(
    "commitMessageGeneration.vscodeLM.preferredModelFamily",
    null
  );
  const preferredModelVersion = configuration.get<string | null>(
    "commitMessageGeneration.vscodeLM.preferredModelVersion",
    DEFAULT_VSCODE_LM_MODEL.version
  );

  return {
    vendor: preferredVendor ?? DEFAULT_VSCODE_LM_MODEL.vendor,
    family: preferredModelFamily ?? DEFAULT_VSCODE_LM_MODEL.family,
    version: preferredModelVersion ?? DEFAULT_VSCODE_LM_MODEL.version,
    id:
      !preferredVendor && !preferredModelFamily && !preferredModelVersion
        ? DEFAULT_VSCODE_LM_MODEL.id
        : undefined
  };
}

function buildModelSelectors(
  criteria: PreferredModelCriteria
): Array<vscode.LanguageModelChatSelector | Record<string, never>> {
  const selectors: Array<
    vscode.LanguageModelChatSelector | Record<string, never>
  > = [];
  const selectorKeys = new Set<string>();

  const pushSelector = (
    selector: vscode.LanguageModelChatSelector | Record<string, never>
  ): void => {
    const key = JSON.stringify(selector);

    if (!selectorKeys.has(key)) {
      selectorKeys.add(key);
      selectors.push(selector);
    }
  };

  if (criteria.vendor && criteria.family) {
    pushSelector({
      vendor: criteria.vendor,
      family: criteria.family
    });
  }

  if (criteria.vendor) {
    pushSelector({ vendor: criteria.vendor });
  }

  if (criteria.family) {
    pushSelector({ family: criteria.family });
  }

  pushSelector({ vendor: DEFAULT_VSCODE_LM_MODEL.vendor });
  pushSelector({});

  return selectors;
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

function getOutputLanguageInstruction(): string {
  const language = configuration.get<string>(
    "commitMessageGeneration.outputLanguage",
    "auto"
  );
  const editorLanguage = vscode.env.language.toLowerCase();

  switch (language) {
    case "en":
      return "Write the commit message in English.";
    case "ko":
      return "Write the commit message in Korean.";
    case "ja":
      return "Write the commit message in Japanese.";
    case "zh-CN":
      return "Write the commit message in Simplified Chinese.";
    case "zh-TW":
      return "Write the commit message in Traditional Chinese.";
    default:
      if (editorLanguage === "ko" || editorLanguage.startsWith("ko-")) {
        return "Write the commit message in Korean.";
      }

      if (editorLanguage === "ja" || editorLanguage.startsWith("ja-")) {
        return "Write the commit message in Japanese.";
      }

      if (editorLanguage === "zh-tw" || editorLanguage.startsWith("zh-hant")) {
        return "Write the commit message in Traditional Chinese.";
      }

      if (editorLanguage === "zh-cn" || editorLanguage.startsWith("zh-hans")) {
        return "Write the commit message in Simplified Chinese.";
      }

      return "Write the commit message in English.";
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

async function selectModel(
  traceId?: string
): Promise<vscode.LanguageModelChat | undefined> {
  const preferredCriteria = getPreferredModelCriteria();

  // Query broad selectors first, then filter in memory. This keeps the
  // default raptor-mini selection fast without relying on a slow version-only lookup.
  for (const selector of buildModelSelectors(preferredCriteria)) {
    const models = await vscode.lm.selectChatModels(selector);
    const matchedModel = pickBestMatchingModel(models, preferredCriteria);

    if (matchedModel) {
      logCommitMessageTrace(
        traceId ?? "select-model",
        `selected model ${describeModel(matchedModel)}`
      );
      return matchedModel;
    }
  }

  return undefined;
}

async function readResponseText(
  response: vscode.LanguageModelChatResponse,
  traceId?: string
): Promise<string> {
  let text = "";
  let fragmentCount = 0;
  let firstFragmentLogged = false;
  const startedAt = Date.now();

  for await (const fragment of response.text) {
    fragmentCount += 1;

    if (!firstFragmentLogged) {
      firstFragmentLogged = true;
      logCommitMessageTrace(
        traceId ?? "response-text",
        `first response fragment received in ${getElapsedMilliseconds(
          startedAt
        )}ms`
      );
    }

    text += fragment;
  }

  logCommitMessageTrace(
    traceId ?? "response-text",
    `response stream completed in ${getElapsedMilliseconds(
      startedAt
    )}ms fragments=${fragmentCount} chars=${text.length}`
  );

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

  if (isCommitMessageLeadInLine(normalized)) {
    return true;
  }

  if (
    /^(if necessary|keeping it simple|that should work nicely|this should work|this keeps it|i kept it|you can use this|let me know if you'd like|let me know if you want|i can also|i could also)\b/i.test(
      normalized
    )
  ) {
    return true;
  }

  if (/^(i|we)'m\s+/i.test(normalized)) {
    return true;
  }

  return /^(i|we)\s+(need to|should|will|want to|am|have to)\b/i.test(
    normalized
  );
}

function isCommitMessageLeadInLine(line: string): boolean {
  return [
    /^(?:the\s+)?commit\s+message\b/i,
    /^(?:here(?:'s| is)\s+)?(?:a\s+|the\s+)?commit\s+message\b/i,
    /^(?:my|suggested|recommended|proposed|final|concise|short)\s+commit\s+message\b/i,
    /^(?:a\s+)?(?:good|concise|short)\s+commit\s+message\s+would\s+be\b/i,
    /^(?:subject|subject\s+line)\b/i,
    /^(?:suggestion|recommendation)\b/i
  ].some(pattern => pattern.test(line));
}

function extractQuotedCommitMessage(text: string): string | undefined {
  const trimmed = text.trim();
  const quotedCandidate = trimmed.match(/^(["'`])(.+?)(?:["'`])[.!?。！？]?$/);

  if (quotedCandidate) {
    return quotedCandidate[2].trim();
  }

  const smartQuotedCandidate = trimmed.match(
    /^([“”])(.+?)(?:[“”])[.!?。！？]?$/
  );

  if (smartQuotedCandidate) {
    return smartQuotedCandidate[2].trim();
  }

  return trimmed.replace(/[.!?。！？]+$/, "").trim() || undefined;
}

function extractCommitMessageFromLeadIn(line: string): string | undefined {
  const normalized = line.trim();

  const leadInPatterns = [
    /^(?:(?:the\s+)?commit\s+message(?:\s+i(?:'|’)?ll\s+use|\s+i(?:'|’)?d\s+use)?|(?:here(?:'s| is)\s+)?(?:a\s+|the\s+)?commit\s+message|(?:my|suggested|recommended|proposed|final|concise|short)\s+commit\s+message)(?:\s+would\s+be|\s+is)?\s*[:\-]\s*(.+)$/i,
    /^(?:a\s+)?(?:good|concise|short)\s+commit\s+message\s+would\s+be\s*[:\-]\s*(.+)$/i,
    /^(?:subject|subject\s+line)\s*[:\-]\s*(.+)$/i,
    /^(?:suggestion|recommendation)\s*[:\-]\s*(.+)$/i
  ];

  for (const pattern of leadInPatterns) {
    const match = normalized.match(pattern);

    if (!match) {
      continue;
    }

    return extractQuotedCommitMessage(match[1]);
  }

  return;
}

function sanitizeCommitMessageResponse(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").trim();

  if (!normalized) {
    return "";
  }

  const lines = normalized.split("\n");
  const sanitizedLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      if (
        sanitizedLines.length > 0 &&
        sanitizedLines[sanitizedLines.length - 1]
      ) {
        sanitizedLines.push("");
      }

      continue;
    }

    const extractedCommitMessage = extractCommitMessageFromLeadIn(line);

    if (extractedCommitMessage) {
      sanitizedLines.push(extractedCommitMessage);
      continue;
    }

    if (looksLikeReasoningLine(line)) {
      continue;
    }

    sanitizedLines.push(rawLine.trimEnd());
  }

  const sanitized = sanitizedLines.join("\n").trim();
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
    ? `\nUnified diff (possibly truncated):\n${diff}`
    : "\nNo diff content was available.";

  return [
    "You generate SVN commit messages.",
    getOutputLanguageInstruction(),
    "Return only the final commit message text.",
    "Use an imperative subject line and keep it concise.",
    "Add a blank line and a short body only when it adds real value.",
    "Do not invent changes that are not present in the provided context.",
    "",
    "Changed files:",
    summary,
    "",
    "Template fallback draft:",
    fallbackMessage,
    diffSection
  ].join("\n");
}

function buildPromptMessages({
  repository,
  resources,
  fallbackMessage,
  diff
}: CommitMessagePromptContext): string[] {
  const summary = getResourceSummary(repository, resources);
  const instructionBlock = [
    "You generate SVN commit messages.",
    getOutputLanguageInstruction(),
    "Return only the final commit message text.",
    "Use an imperative subject line and keep it concise.",
    "Add a blank line and a short body only when it adds real value.",
    "Do not invent changes that are not present in the provided context."
  ].join("\n");

  const contextSections = [
    "Changed files:",
    summary,
    "",
    "Template fallback draft:",
    fallbackMessage
  ];

  if (diff) {
    contextSections.push("", "Unified diff (possibly truncated):", diff);
  } else {
    contextSections.push("", "No diff content was available.");
  }

  return [instructionBlock, contextSections.join("\n")];
}

class VscodeLanguageModelCommitMessageProvider
  implements CommitMessageProvider {
  public async generate(
    prompt: string | CommitMessagePromptContext,
    token?: vscode.CancellationToken
  ): Promise<CommitMessageAIResult> {
    const traceId =
      typeof prompt === "string"
        ? Date.now().toString(36)
        : prompt.traceId ?? Date.now().toString(36);
    const startedAt = Date.now();

    try {
      logCommitMessageTrace(traceId, "provider=vscode-lm start");

      const selectModelStartedAt = Date.now();
      const model = await selectModel(traceId);
      logCommitMessageTrace(
        traceId,
        `selectModel completed in ${getElapsedMilliseconds(
          selectModelStartedAt
        )}ms${model ? "" : " (no model)"}`
      );

      if (!model) {
        return { reason: "no-model" };
      }

      const promptMessages = (typeof prompt === "string"
        ? [prompt]
        : buildPromptMessages(prompt)
      ).map(section => vscode.LanguageModelChatMessage.User(section));

      const sendRequestStartedAt = Date.now();
      logCommitMessageTrace(
        traceId,
        `sendRequest start with ${promptMessages.length} message part(s)`
      );
      const response = await model.sendRequest(
        promptMessages,
        {
          justification: vscode.l10n.t(
            "Generate an SVN commit message from the current working copy changes."
          )
        },
        token
      );
      logCommitMessageTrace(
        traceId,
        `sendRequest completed in ${getElapsedMilliseconds(
          sendRequestStartedAt
        )}ms`
      );

      const readResponseStartedAt = Date.now();
      const message = sanitizeCommitMessageResponse(
        await readResponseText(response, traceId)
      );
      logCommitMessageTrace(
        traceId,
        `readResponseText completed in ${getElapsedMilliseconds(
          readResponseStartedAt
        )}ms`
      );

      if (!message) {
        logCommitMessageTrace(
          traceId,
          `provider=vscode-lm finished with empty message in ${getElapsedMilliseconds(
            startedAt
          )}ms`
        );
        return { reason: "error" };
      }

      logCommitMessageTrace(
        traceId,
        `provider=vscode-lm finished in ${getElapsedMilliseconds(startedAt)}ms`
      );
      return { message };
    } catch (error) {
      logCommitMessageTrace(
        traceId,
        `provider=vscode-lm failed after ${getElapsedMilliseconds(
          startedAt
        )}ms: ${error instanceof Error ? error.message : String(error)}`
      );
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
    prompt: string | CommitMessagePromptContext,
    token?: vscode.CancellationToken
  ): Promise<CommitMessageAIResult> {
    const promptText =
      typeof prompt === "string" ? prompt : buildPrompt(prompt);
    const baseUrl = this.getBaseUrl();
    const model = this.getModel();

    if (!baseUrl || !model) {
      return { reason: "error" };
    }

    const apiType = this.getApiType();

    if (apiType === "responses") {
      return this.generateWithResponsesApi(promptText, token);
    }

    if (apiType === "chat-completions") {
      return this.generateWithChatCompletions(promptText, token);
    }

    const responsesResult = await this.generateWithResponsesApi(
      promptText,
      token
    );
    if (responsesResult.message) {
      return responsesResult;
    }

    if (responsesResult.reason === "missing-api-key") {
      return responsesResult;
    }

    return this.generateWithChatCompletions(promptText, token);
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
    prompt: string | CommitMessagePromptContext,
    token?: vscode.CancellationToken
  ): Promise<CommitMessageAIResult> {
    const promptText =
      typeof prompt === "string" ? prompt : buildPrompt(prompt);
    const endpoint = getAzureOpenAIEndpoint();
    const deployment = getAzureOpenAIDeployment();

    if (!endpoint || !deployment) {
      return { reason: "error" };
    }

    return getAzureOpenAIApiType() === "responses"
      ? this.generateWithResponsesApi(promptText, token)
      : this.generateWithChatCompletions(promptText, token);
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
    return await new OpenAICompatibleCommitMessageProvider(options.fetchFn, {
      baseUrl: options.baseUrl,
      model: options.model,
      apiType: options.apiType
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
  const traceId = Date.now().toString(36);
  const startedAt = Date.now();

  try {
    logCommitMessageTrace(
      traceId,
      `generateAICommitMessage start provider=${getCommitMessageAIProvider()} resources=${
        resources.length
      }`
    );

    const diffStartedAt = Date.now();
    logCommitMessageTrace(traceId, "diff collection start");
    let diff: string | undefined;

    try {
      diff = await getDiffContext(repository, resources);
      logCommitMessageTrace(
        traceId,
        `diff collection completed in ${getElapsedMilliseconds(
          diffStartedAt
        )}ms${
          typeof diff === "string" ? ` (chars=${diff.length})` : " (no diff)"
        }`
      );
    } catch (error) {
      logCommitMessageTrace(
        traceId,
        `diff collection failed after ${getElapsedMilliseconds(
          diffStartedAt
        )}ms: ${error instanceof Error ? error.message : String(error)}`
      );
      diff = undefined;
    }

    const promptContext = {
      repository,
      resources,
      fallbackMessage,
      diff,
      traceId
    };

    const providerStartedAt = Date.now();
    const result = await createCommitMessageProvider().generate(
      promptContext,
      token
    );
    logCommitMessageTrace(
      traceId,
      `provider.generate completed in ${getElapsedMilliseconds(
        providerStartedAt
      )}ms${
        result.message
          ? " (message returned)"
          : ` (reason=${result.reason ?? "unknown"})`
      }`
    );
    logCommitMessageTrace(
      traceId,
      `generateAICommitMessage finished in ${getElapsedMilliseconds(
        startedAt
      )}ms`
    );

    return result;
  } catch (error) {
    logCommitMessageTrace(
      traceId,
      `generateAICommitMessage failed after ${getElapsedMilliseconds(
        startedAt
      )}ms: ${error instanceof Error ? error.message : String(error)}`
    );
    return { reason: "error", error };
  }
}

export const __test__ = {
  buildPrompt,
  buildPromptMessages,
  getOutputLanguageInstruction,
  readResponseText,
  sanitizeCommitMessageResponse,
  extractResponsesApiText,
  extractChatCompletionsText,
  generateOpenAICompatibleCommitMessageForTests
};
