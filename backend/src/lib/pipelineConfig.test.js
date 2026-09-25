import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_PIPELINE_STAGES,
  getPipelineStage,
  sanitizePipelineStages,
  validatePipelineStages,
} from "./pipelineConfig.js";

test("empty pipeline receives safe CRM defaults", () => {
  const stages = sanitizePipelineStages([]);
  assert.equal(stages.length, DEFAULT_PIPELINE_STAGES.length);
  assert.equal(stages[0].key, "nuevo");
  assert.equal(stages[0].is_default, true);
  assert.deepEqual(stages.slice(-2).map((stage) => stage.category), ["won", "lost"]);
});

test("sanitizes keys, colors, categories, duplicates and positions", () => {
  const stages = sanitizePipelineStages([
    { label: "  Revisión inicial  ", color: "javascript:red", position: 10, is_default: true },
    { key: "revision_inicial", label: "Duplicado", position: 0 },
    { key: "ganadó", label: "Ganado", category: "won", color: "#12ABef", position: 4 },
    { key: "perdido", label: "Perdido", category: "lost", position: 5 },
  ]);

  assert.deepEqual(stages.map((stage) => stage.key), ["ganado", "perdido", "revision_inicial"]);
  assert.equal(stages[0].color, "#12abef");
  assert.equal(stages[2].color, "#64748b");
  assert.equal(stages[2].is_default, true);
  assert.deepEqual(stages.map((stage) => stage.position), [0, 1, 2]);
});

test("pipeline validation requires active open, won and lost categories", () => {
  const result = validatePipelineStages([
    { key: "nuevo", label: "Nuevo", category: "open" },
    { key: "ganado", label: "Ganado", category: "won" },
  ]);
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors.map((error) => error.code), ["missing_lost_stage"]);
});

test("stage lookup falls back to the configured default", () => {
  const stages = [
    { key: "entrada", label: "Entrada", category: "open", is_default: true },
    { key: "ganado", label: "Ganado", category: "won" },
    { key: "perdido", label: "Perdido", category: "lost" },
  ];
  assert.equal(getPipelineStage(stages, "GANADO").label, "Ganado");
  assert.equal(getPipelineStage(stages, "estado-inexistente").key, "entrada");
});

