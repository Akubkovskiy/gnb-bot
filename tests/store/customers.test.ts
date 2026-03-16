import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CustomerStore } from "../../src/store/customers.js";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "gnb-customers-"));
}

describe("CustomerStore", () => {
  let tmpDir: string;
  let store: CustomerStore;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    store = new CustomerStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("list returns empty initially", () => {
    expect(store.list()).toEqual([]);
  });

  it("add and get customer", () => {
    store.add({
      slug: "kraft",
      name: "Крафт",
      aliases: ["крафт", "kraft"],
      objects: {
        marino: { name: "Марьино", path: "Крафт/Марьино" },
      },
    });
    expect(store.get("kraft")?.name).toBe("Крафт");
    expect(store.list()).toHaveLength(1);
  });

  it("findByNameOrAlias", () => {
    store.add({
      slug: "kraft",
      name: "Крафт",
      aliases: ["крафт", "kraft"],
      objects: {},
    });
    expect(store.findByNameOrAlias("Крафт")?.slug).toBe("kraft");
    expect(store.findByNameOrAlias("kraft")?.slug).toBe("kraft");
    expect(store.findByNameOrAlias("крафт")?.slug).toBe("kraft");
    expect(store.findByNameOrAlias("Неизвестный")).toBeNull();
  });

  it("getObjects returns object entries", () => {
    store.add({
      slug: "kraft",
      name: "Крафт",
      aliases: [],
      objects: {
        marino: { name: "Марьино", path: "Крафт/Марьино" },
        ogorodnyy: { name: "Огородный", path: "Крафт/Огородный" },
      },
    });
    expect(store.getObjects("kraft")).toHaveLength(2);
    expect(store.getObjects("unknown")).toHaveLength(0);
  });

  it("updateLastGnb", () => {
    store.add({
      slug: "kraft",
      name: "Крафт",
      aliases: [],
      objects: {
        marino: { name: "Марьино", path: "Крафт/Марьино" },
      },
    });
    store.updateLastGnb("kraft", "marino", "ЗП № 5-6");
    const obj = store.getObjects("kraft").find((o) => o.name === "Марьино");
    expect(obj?.last_gnb).toBe("ЗП № 5-6");
  });
});
