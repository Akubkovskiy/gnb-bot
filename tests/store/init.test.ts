import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Mock paths and logger before import
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gnb-init-"));
const memDir = path.join(tmpDir, ".gnb-memory");

vi.mock("../../src/utils/paths.js", () => ({
  getMemoryDir: () => memDir,
}));

vi.mock("../../src/logger.js", () => ({
  logger: { info: () => {}, warn: () => {} },
}));

// Import after mocks
const { initMemory } = await import("../../src/memory/init.js");

describe("initMemory", () => {
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates all expected files and directories idempotently", () => {
    // First call creates everything
    initMemory();

    expect(fs.existsSync(path.join(memDir, "docs"))).toBe(true);
    expect(fs.existsSync(path.join(memDir, "drafts"))).toBe(true);
    expect(fs.existsSync(path.join(memDir, "projects.json"))).toBe(true);
    expect(fs.existsSync(path.join(memDir, "people.json"))).toBe(true);
    expect(fs.existsSync(path.join(memDir, "organizations.json"))).toBe(true);
    expect(fs.existsSync(path.join(memDir, "gnb-transitions.json"))).toBe(true);
    expect(fs.existsSync(path.join(memDir, "customers.json"))).toBe(true);
    expect(fs.existsSync(path.join(memDir, "preferences.json"))).toBe(true);

    // Verify customers.json structure
    const customers = JSON.parse(fs.readFileSync(path.join(memDir, "customers.json"), "utf-8"));
    expect(customers).toEqual({ customers: {} });

    // Verify preferences.json structure
    const prefs = JSON.parse(fs.readFileSync(path.join(memDir, "preferences.json"), "utf-8"));
    expect(prefs.default_city).toBe("г. Москва");
    expect(prefs.default_pipe_count).toBe(2);

    // Second call is idempotent (doesn't overwrite existing files)
    fs.writeFileSync(path.join(memDir, "customers.json"), '{"customers":{"test":true}}');
    initMemory();
    const after = JSON.parse(fs.readFileSync(path.join(memDir, "customers.json"), "utf-8"));
    expect(after.customers.test).toBe(true); // not overwritten
  });
});
