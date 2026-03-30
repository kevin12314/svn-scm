import * as assert from "assert";
import { ISvnLogEntry } from "../common/types";
import { getDetailedCommitMessage } from "../historyView/common";

suite("History View Common Tests", () => {
  test("formats detailed commit message with changed paths", () => {
    const commit: ISvnLogEntry = {
      revision: "42",
      author: "alice",
      date: "2026-03-30T12:34:56.000Z",
      msg: "Fix merge conflict handling",
      paths: [
        {
          _: "/trunk/src/file.ts",
          action: "M",
          kind: "file"
        },
        {
          _: "/trunk/src/new-file.ts",
          action: "A",
          kind: "file"
        }
      ]
    };

    const text = getDetailedCommitMessage(commit);

    assert.ok(text.includes("Revision: r42"), text);
    assert.ok(text.includes("Author: alice"), text);
    assert.ok(text.includes("Message:"), text);
    assert.ok(text.includes("Fix merge conflict handling"), text);
    assert.ok(text.includes("Changed paths:"), text);
    assert.ok(text.includes("- M /trunk/src/file.ts"), text);
    assert.ok(text.includes("- A /trunk/src/new-file.ts"), text);
  });

  test("omits changed paths section when commit has no paths", () => {
    const commit: ISvnLogEntry = {
      revision: "7",
      author: "bob",
      date: "not-a-date",
      msg: "",
      paths: []
    };

    const text = getDetailedCommitMessage(commit);

    assert.ok(text.includes("Revision: r7"), text);
    assert.ok(text.includes("Date: not-a-date"), text);
    assert.equal(text.includes("Changed paths:"), false, text);
  });
});
