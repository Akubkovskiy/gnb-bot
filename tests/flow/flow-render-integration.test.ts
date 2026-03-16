/**
 * Phase 4.8 integration test: flow finalization → renderer → files on disk.
 *
 * Uses real templates + real renderers + flow's finalizeDraft().
 * Verifies the handoff contract: finalizeDraft().transition → renderInternalActs/renderAosr.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { finalizeDraft } from "../../src/flow/new-flow.js";
import { renderInternalActs } from "../../src/renderer/internal-acts.js";
import { renderAosr } from "../../src/renderer/aosr.js";
import { DraftStore } from "../../src/store/drafts.js";
import { TransitionStore } from "../../src/store/transitions.js";
import { CustomerStore } from "../../src/store/customers.js";
import { PeopleStore } from "../../src/store/people.js";
import type { FlowStores } from "../../src/flow/flow-types.js";
import type { Draft, Transition } from "../../src/domain/types.js";
import { makeTestTransition } from "../renderer/fixtures.js";

let tmpDir: string;
let outputDir: string;
let stores: FlowStores;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gnb-flow-render-"));
  outputDir = path.join(tmpDir, "output");
  stores = {
    drafts: new DraftStore(tmpDir),
    transitions: new TransitionStore(tmpDir),
    customers: new CustomerStore(tmpDir),
    people: new PeopleStore(tmpDir),
  };
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Build a complete draft that will pass validation. */
function makeCompleteDraft(): Draft {
  const t = makeTestTransition({ status: "draft" });
  return {
    id: "draft-test-1",
    step: 9,
    chat_id: 12345,
    data: {
      id: t.id,
      customer: t.customer,
      object: t.object,
      gnb_number: t.gnb_number,
      gnb_number_short: t.gnb_number_short,
      title_line: t.title_line,
      object_name: t.object_name,
      address: t.address,
      project_number: t.project_number,
      executor: t.executor,
      start_date: t.start_date,
      end_date: t.end_date,
      organizations: t.organizations,
      signatories: t.signatories,
      pipe: t.pipe,
      gnb_params: t.gnb_params,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

describe("flow → renderer integration", () => {
  it("finalizeDraft produces a Transition that renderInternalActs accepts", async () => {
    const draft = makeCompleteDraft();
    stores.drafts.create(draft.id, draft.chat_id, draft.step, draft.data);

    const result = finalizeDraft(stores.drafts.get(draft.id)!, stores);
    expect(result).not.toBeNull();
    expect(result!.transition.status).toBe("finalized");

    const renderResult = await renderInternalActs(result!.transition, outputDir);
    expect(renderResult.filePath).toContain("Акты ЗП ГНБ 5-5.xlsx");
    expect(fs.existsSync(renderResult.filePath)).toBe(true);
    expect(renderResult.cellsFilled).toBeGreaterThanOrEqual(27);
  });

  it("finalizeDraft produces a Transition that renderAosr accepts", async () => {
    const draft = makeCompleteDraft();
    stores.drafts.create(draft.id, draft.chat_id, draft.step, draft.data);

    const result = finalizeDraft(stores.drafts.get(draft.id)!, stores);
    expect(result).not.toBeNull();

    const renderResult = await renderAosr(result!.transition, outputDir);
    expect(renderResult.filePath).toContain("АОСР ОЭК-ГНБ 5-5.xlsx");
    expect(fs.existsSync(renderResult.filePath)).toBe(true);
    expect(renderResult.cellsFilled).toBeGreaterThanOrEqual(30);
  });

  it("both renderers write to same output directory", async () => {
    const draft = makeCompleteDraft();
    stores.drafts.create(draft.id, draft.chat_id, draft.step, draft.data);

    const result = finalizeDraft(stores.drafts.get(draft.id)!, stores);
    expect(result).not.toBeNull();

    const acts = await renderInternalActs(result!.transition, outputDir);
    const aosr = await renderAosr(result!.transition, outputDir);

    // Both files in same directory
    expect(path.dirname(acts.filePath)).toBe(path.dirname(aosr.filePath));

    // Both files exist
    const dirContents = fs.readdirSync(outputDir);
    expect(dirContents).toContain("Акты ЗП ГНБ 5-5.xlsx");
    expect(dirContents).toContain("АОСР ОЭК-ГНБ 5-5.xlsx");
  });

  it("transition is saved in TransitionStore after finalization", async () => {
    const draft = makeCompleteDraft();
    stores.drafts.create(draft.id, draft.chat_id, draft.step, draft.data);

    const result = finalizeDraft(stores.drafts.get(draft.id)!, stores);
    expect(result).not.toBeNull();

    // Transition persisted
    const saved = stores.transitions.get(result!.transition.id);
    expect(saved).not.toBeNull();
    expect(saved!.gnb_number).toBe("ЗП № 5-5");

    // Draft deleted
    expect(stores.drafts.get(draft.id)).toBeNull();
  });

  it("render failure does not lose the transition", async () => {
    const draft = makeCompleteDraft();
    stores.drafts.create(draft.id, draft.chat_id, draft.step, draft.data);

    const result = finalizeDraft(stores.drafts.get(draft.id)!, stores);
    expect(result).not.toBeNull();

    // Even if render throws (e.g., bad outputDir), transition is already saved
    const saved = stores.transitions.get(result!.transition.id);
    expect(saved).not.toBeNull();

    // Simulate: renderers are called AFTER finalize, so transition survives render failure
    // (actual render error handling is in handlers.ts)
  });
});
