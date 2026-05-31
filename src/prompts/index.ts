/**
 * Codument Prompts
 *
 * All prompt files are loaded using __dirname + fs.readFileSync,
 * which allows Bun to embed them into the executable via bunfs.
 */

import * as fs from "fs";
import * as path from "path";

// Helper to read prompt file content
function loadPrompt(filename: string): string {
  const filePath = path.join(__dirname, filename);
  return fs.readFileSync(filePath, "utf-8");
}

// Helper to read template file content
function loadTemplate(filename: string): string {
  const filePath = path.join(__dirname, "templates", filename);
  return fs.readFileSync(filePath, "utf-8");
}

// Core prompts
export const stdAgentsPrompt = loadPrompt("std_agents.md");
export const rootAgentsPrompt = loadPrompt("root_agents.md");
export const initPrompt = loadPrompt("init.md");
export const trackPrompt = loadPrompt("track.md");
export const implementPrompt = loadPrompt("implement.md");
export const validatePrompt = loadPrompt("validate.md");
export const archivePrompt = loadPrompt("archive.md");
export const statusPrompt = loadPrompt("status.md");
export const planXmlSpec = loadPrompt("plan-xml-spec.md");
export const protocolsPrompt = loadPrompt("protocols.md");
export const discussPrompt = loadPrompt("discuss.md");
export const planWavePrompt = loadPrompt("plan-wave.md");
export const executeWavePrompt = loadPrompt("execute-wave.md");
export const verifyPrompt = loadPrompt("verify.md");
export const gapLoopPrompt = loadPrompt("gap-loop.md");

// Templates
export const workflowTemplate = loadTemplate("workflow.md");
export const projectTemplate = loadTemplate("project.md");
export const productTemplate = loadTemplate("product.md");
export const techStackTemplate = loadTemplate("tech-stack.md");
export const docsKnowledgeTemplate = loadTemplate("docs-knowledge.md");
export const docsModelingFractalTemplate = loadTemplate("docs-modeling-fractal.md");
export const docsImplFractalTemplate = loadTemplate("docs-impl-fractal.md");
export const projectMemoryTemplate = loadTemplate("project-memory.md");

// Export all prompts as a map
export const prompts = {
  agents: stdAgentsPrompt,
  init: initPrompt,
  track: trackPrompt,
  implement: implementPrompt,
  validate: validatePrompt,
  archive: archivePrompt,
  status: statusPrompt,
  tasksXmlSpec: planXmlSpec,
  discuss: discussPrompt,
  planWave: planWavePrompt,
  executeWave: executeWavePrompt,
  verify: verifyPrompt,
  gapLoop: gapLoopPrompt,
};

// Export all templates as a map
export const templates = {
  workflow: workflowTemplate,
  project: projectTemplate,
  product: productTemplate,
  techStack: techStackTemplate,
  docsKnowledge: docsKnowledgeTemplate,
  docsModelingFractal: docsModelingFractalTemplate,
  docsImplFractal: docsImplFractalTemplate,
  projectMemory: projectMemoryTemplate,
};

/**
 * Get a prompt by name
 */
export function getPrompt(name: keyof typeof prompts): string {
  return prompts[name];
}

/**
 * Get a template by name
 */
export function getTemplate(name: keyof typeof templates): string {
  return templates[name];
}
