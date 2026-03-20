import { l10n, SourceControlResourceState, Uri, window } from "vscode";
import { Status, SvnDepth } from "../common/types";
import { lstat } from "../fs";

type RevertableResourceState = SourceControlResourceState & {
  type?: string;
};

function isAddedSelection(resourceStates: RevertableResourceState[] = []) {
  return (
    resourceStates.length > 0 &&
    resourceStates.every(resource => resource.type === Status.ADDED)
  );
}

export async function confirmRevert(
  resourceStates: RevertableResourceState[] = []
) {
  const yes = l10n.t("Yes I'm sure");
  const message = isAddedSelection(resourceStates)
    ? l10n.t(
        "Are you sure? This will undo the add and leave the files as unversioned."
      )
    : l10n.t("Are you sure? This will wipe all local changes.");
  const answer = await window.showWarningMessage(message, { modal: true }, yes);

  if (answer !== yes) {
    return false;
  }

  return true;
}

export async function promptDepth() {
  const picks: any[] = [];

  for (const depth in SvnDepth) {
    if (SvnDepth.hasOwnProperty(depth)) {
      picks.push({ label: depth, description: (SvnDepth as any)[depth] });
    }
  }

  const placeHolder = l10n.t("Select revert depth");
  const pick = await window.showQuickPick(picks, { placeHolder });
  if (!pick) {
    return undefined;
  }
  return pick.label;
}

export async function checkAndPromptDepth(
  uris: Uri[],
  defaultDepth: keyof typeof SvnDepth = "empty"
) {
  // Without uris, force prompt
  let hasDirectory = uris.length === 0;

  for (const uri of uris) {
    if (uri.scheme !== "file") {
      continue;
    }
    try {
      const stat = await lstat(uri.fsPath);
      if (stat.isDirectory()) {
        hasDirectory = true;
        break;
      }
    } catch {
      // ignore
    }
  }

  if (hasDirectory) {
    return promptDepth();
  }

  return defaultDepth;
}
