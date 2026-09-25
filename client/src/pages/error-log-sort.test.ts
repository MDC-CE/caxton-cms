import { describe, expect, it } from "vitest";
import {
  ERROR_LOG_SORT_DEFAULT,
  nextErrorLogSort,
  parseErrorLogSort,
  serializeErrorLogSort,
  sortErrorLogIssues,
} from "./error-log-sort";

describe("parseErrorLogSort", () => {
  it("falls back to server order for missing or unknown keys", () => {
    expect(parseErrorLogSort("")).toEqual(ERROR_LOG_SORT_DEFAULT);
    expect(parseErrorLogSort("?sort=module&dir=asc")).toEqual(ERROR_LOG_SORT_DEFAULT);
  });

  it("reads key and direction, defaulting direction to desc", () => {
    expect(parseErrorLogSort("?sort=count")).toEqual({ key: "count", dir: "desc" });
    expect(parseErrorLogSort("sort=lastSeen&dir=asc")).toEqual({ key: "lastSeen", dir: "asc" });
    expect(parseErrorLogSort("?sort=count&dir=bogus")).toEqual({ key: "count", dir: "desc" });
  });
});

describe("serializeErrorLogSort", () => {
  it("omits defaults and keeps unrelated params", () => {
    expect(serializeErrorLogSort({ key: "count", dir: "desc" }, "?foo=1")).toBe("foo=1&sort=count");
    expect(serializeErrorLogSort({ key: "lastSeen", dir: "asc" })).toBe("sort=lastSeen&dir=asc");
    expect(serializeErrorLogSort(ERROR_LOG_SORT_DEFAULT, "?sort=count&dir=asc&foo=1")).toBe("foo=1");
  });

  it("round-trips through parse", () => {
    const sort = { key: "lastSeen", dir: "asc" } as const;
    expect(parseErrorLogSort(serializeErrorLogSort(sort))).toEqual(sort);
  });
});

describe("nextErrorLogSort", () => {
  it("cycles desc → asc → default on the same column", () => {
    const first = nextErrorLogSort(ERROR_LOG_SORT_DEFAULT, "count");
    expect(first).toEqual({ key: "count", dir: "desc" });
    const second = nextErrorLogSort(first, "count");
    expect(second).toEqual({ key: "count", dir: "asc" });
    expect(nextErrorLogSort(second, "count")).toEqual(ERROR_LOG_SORT_DEFAULT);
  });

  it("starts descending when switching columns", () => {
    expect(nextErrorLogSort({ key: "count", dir: "asc" }, "lastSeen")).toEqual({
      key: "lastSeen",
      dir: "desc",
    });
  });
});

describe("sortErrorLogIssues", () => {
  const issues = [
    { id: "a", count: 5, lastTs: 100 },
    { id: "b", count: 10, lastTs: 50 },
    { id: "c", count: 5, lastTs: 300 },
  ];

  it("returns the input order for the default sort", () => {
    expect(sortErrorLogIssues(issues, ERROR_LOG_SORT_DEFAULT)).toBe(issues);
  });

  it("sorts by count with last seen as tie-breaker", () => {
    expect(sortErrorLogIssues(issues, { key: "count", dir: "desc" }).map((i) => i.id)).toEqual(["b", "c", "a"]);
    expect(sortErrorLogIssues(issues, { key: "count", dir: "asc" }).map((i) => i.id)).toEqual(["a", "c", "b"]);
  });

  it("sorts by last seen", () => {
    expect(sortErrorLogIssues(issues, { key: "lastSeen", dir: "desc" }).map((i) => i.id)).toEqual(["c", "a", "b"]);
    expect(sortErrorLogIssues(issues, { key: "lastSeen", dir: "asc" }).map((i) => i.id)).toEqual(["b", "a", "c"]);
  });
});
