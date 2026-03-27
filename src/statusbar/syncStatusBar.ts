import { Command, Disposable, Event, EventEmitter, l10n } from "vscode";
import { Operation } from "../common/types";
import { Repository } from "../repository";

interface ISyncStatusBarState {
  isIncomplete: boolean;
  isOperationRunning: boolean;
  isStatusRemoteRunning: boolean;
  isSyncRunning: boolean;
  needCleanUp: boolean;
  remoteChangedFiles: number;
}

export class SyncStatusBar {
  private static startState: ISyncStatusBarState = {
    isIncomplete: false,
    isOperationRunning: false,
    isStatusRemoteRunning: false,
    isSyncRunning: false,
    needCleanUp: false,
    remoteChangedFiles: 0
  };

  private _onDidChange = new EventEmitter<void>();
  get onDidChange(): Event<void> {
    return this._onDidChange.event;
  }
  private disposables: Disposable[] = [];

  private _state: ISyncStatusBarState = SyncStatusBar.startState;
  private get state() {
    return this._state;
  }
  private set state(state: ISyncStatusBarState) {
    this._state = state;
    this._onDidChange.fire();
  }

  constructor(private repository: Repository) {
    repository.onDidChangeStatus(this.onModelChange, this, this.disposables);
    repository.onDidChangeOperations(
      this.onOperationsChange,
      this,
      this.disposables
    );
    this._onDidChange.fire();
  }

  private onOperationsChange(): void {
    const isSyncRunning =
      this.repository.operations.isRunning(Operation.SwitchBranch) ||
      this.repository.operations.isRunning(Operation.NewBranch) ||
      this.repository.operations.isRunning(Operation.Update) ||
      this.repository.operations.isRunning(Operation.Merge);

    const isStatusRemoteRunning = this.repository.operations.isRunning(
      Operation.StatusRemote
    );

    const isOperationRunning = !this.repository.operations.isIdle();

    this.state = {
      ...this.state,
      isStatusRemoteRunning,
      isOperationRunning,
      isSyncRunning
    };
  }

  private onModelChange(): void {
    this.state = {
      ...this.state,
      remoteChangedFiles: this.repository.remoteChangedFiles
    };
  }

  get command(): Command | undefined {
    let icon = "$(sync)";
    let text = "";
    let command = "";
    let tooltip = "";

    if (this.state.isSyncRunning) {
      command = "";
      icon = "$(sync~spin)";
      text = "";
      tooltip = l10n.t("Updating Revision...");
    } else if (this.state.isStatusRemoteRunning) {
      command = "";
      icon = "$(sync~spin)";
      text = "";
      tooltip = l10n.t("Checking remote updates...");
    } else if (this.state.isOperationRunning) {
      command = "";
      icon = "$(sync~spin)";
      text = "Running";
      tooltip = l10n.t("Running...");
    } else if (this.state.needCleanUp) {
      command = "svn.cleanup";
      icon = "$(alert)";
      text = "Need cleanup";
      tooltip = l10n.t("Run cleanup command");
    } else if (this.state.isIncomplete) {
      command = "svn.finishCheckout";
      icon = "$(issue-reopened)";
      text = "Incomplete (Need finish checkout)";
      tooltip = l10n.t("Run update to complete");
    } else if (this.state.remoteChangedFiles > 0) {
      icon = "$(cloud-download)";
      command = "svn.update";
      tooltip = l10n.t("Update Revision");
      text = `${this.state.remoteChangedFiles}↓`;
    } else {
      command = "svn.update";
      tooltip = l10n.t("Update Revision");
    }

    return {
      command,
      title: [icon, text].join(" ").trim(),
      tooltip,
      arguments: [this.repository]
    };
  }

  public dispose(): void {
    this.disposables.forEach(d => d.dispose());
  }
}
