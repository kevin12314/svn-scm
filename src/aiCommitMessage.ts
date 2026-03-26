import * as vscode from "vscode";
import { configuration } from "./helpers/configuration";
import { Repository } from "./repository";
import { Resource } from "./resource";

type CommitMessageGenerationMode = "auto" | "ai" | "template";

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

export interface CommitMessageAIResult {
  message?: string;
  reason?: "no-api" | "no-model" | "error";
  error?: unknown;
}

function getLanguageModelApi(): LanguageModelApi {
  return (vscode as unknown) as LanguageModelApi;
}

function getOutputLanguageInstruction(): string {
  const language = configuration.get<string>(
    "commitMessageGeneration.outputLanguage",
    "auto"
  );

  switch (language) {
    case "en":
      return vscode.l10n.t("Write the commit message in English.");
    case "zh-TW":
      return vscode.l10n.t("Write the commit message in Traditional Chinese.");
    default:
      return vscode.env.language.toLowerCase() === "zh-tw"
        ? vscode.l10n.t("Write the commit message in Traditional Chinese.")
        : vscode.l10n.t("Write the commit message in English.");
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
    "commitMessageGeneration.preferredVendor",
    null
  );
  const preferredModelFamily = configuration.get<string | null>(
    "commitMessageGeneration.preferredModelFamily",
    null
  );
  const preferredModelVersion = configuration.get<string | null>(
    "commitMessageGeneration.preferredModelVersion",
    configuration.get<string | null>(
      "commitMessageGeneration.preferredModelFamily",
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

function buildPrompt(
  repository: Repository,
  resources: Resource[],
  fallbackMessage: string,
  diff: string | undefined
): string {
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

export function getCommitMessageGenerationMode(): CommitMessageGenerationMode {
  return configuration.get<CommitMessageGenerationMode>(
    "commitMessageGeneration.mode",
    "auto"
  );
}

export async function generateAICommitMessage(
  repository: Repository,
  resources: Resource[],
  fallbackMessage: string
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

    let diff: string | undefined;
    try {
      diff = await getDiffContext(repository, resources);
    } catch {
      diff = undefined;
    }

    const prompt = buildPrompt(repository, resources, fallbackMessage, diff);
    const response = await model.sendRequest(
      [vscodeApi.LanguageModelChatMessage.User(prompt)],
      {
        justification: vscode.l10n.t(
          "Generate an SVN commit message from the current working copy changes."
        )
      },
      undefined
    );

    const message = await readResponseText(response);
    if (!message) {
      return { reason: "error" };
    }

    return { message };
  } catch (error) {
    return { reason: "error", error };
  }
}
