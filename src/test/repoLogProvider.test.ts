import * as assert from "assert";
import { Uri } from "vscode";
import { ISvnLogEntry } from "../common/types";
import {
  ICachedLog,
  ILogTreeItem,
  LogTreeItemKind,
  SvnPath
} from "../historyView/common";
import { RepoLogProvider } from "../historyView/repoLogProvider";

suite("Repo Log Provider Tests", () => {
  test("filters cached entries by author and message without mutating cache", async () => {
    const provider: any = Object.create(
      RepoLogProvider.prototype
    ) as RepoLogProvider;
    provider.logCache = new Map<string, ICachedLog>();
    provider.filterAuthor = "";
    provider.filterMsg = "";

    const repoKey = "https://example.com/svn/project/trunk";
    const entries: ISvnLogEntry[] = [
      {
        revision: "3",
        author: "alice",
        date: "2026-03-19T00:00:00.000Z",
        msg: "fix log filter",
        paths: []
      },
      {
        revision: "2",
        author: "bob",
        date: "2026-03-18T00:00:00.000Z",
        msg: "add feature",
        paths: []
      },
      {
        revision: "1",
        author: "alice",
        date: "2026-03-17T00:00:00.000Z",
        msg: "feature polish",
        paths: []
      }
    ];

    const cachedLog: ICachedLog = {
      entries: [...entries],
      isComplete: true,
      svnTarget: Uri.parse(repoKey),
      repo: {} as any,
      persisted: {
        commitFrom: "HEAD"
      },
      order: 0
    };

    provider.logCache.set(repoKey, cachedLog);

    const repoItem: ILogTreeItem = {
      kind: LogTreeItemKind.Repo,
      data: new SvnPath(repoKey)
    };

    provider.filterAuthor = "alice";
    let children = await provider.getChildren(repoItem);
    assert.deepEqual(
      children.map(
        (child: ILogTreeItem) => (child.data as ISvnLogEntry).revision
      ),
      ["3", "1"]
    );

    provider.filterMsg = "feature";
    children = await provider.getChildren(repoItem);
    assert.deepEqual(
      children.map(
        (child: ILogTreeItem) => (child.data as ISvnLogEntry).revision
      ),
      ["1"]
    );

    provider.filterAuthor = "";
    provider.filterMsg = "";
    children = await provider.getChildren(repoItem);
    assert.deepEqual(
      children.map(
        (child: ILogTreeItem) => (child.data as ISvnLogEntry).revision
      ),
      ["3", "2", "1"]
    );

    assert.equal(cachedLog.entries.length, 3);
    assert.deepEqual(
      cachedLog.entries.map(entry => entry.revision),
      ["3", "2", "1"]
    );
  });
});
