/**
 * Codument Prompts
 *
 * Prompt and template files are imported as text so compiled executables are
 * self-contained and do not read from the source checkout at runtime.
 */

import stdAgentsPromptText from "./std_agents.md" with { type: "text" };
import rootAgentsPromptText from "./root_agents.md" with { type: "text" };
import initPromptText from "./init.md" with { type: "text" };
import trackPromptText from "./track.md" with { type: "text" };
import implementPromptText from "./implement.md" with { type: "text" };
import validatePromptText from "./validate.md" with { type: "text" };
import reviseTrackPromptText from "./revise-track.md" with { type: "text" };
import archivePromptText from "./archive.md" with { type: "text" };
import statusPromptText from "./status.md" with { type: "text" };
import planXmlSpecText from "./plan-xml-spec.md" with { type: "text" };
import protocolsPromptText from "./protocols.md" with { type: "text" };
import discussPromptText from "./discuss.md" with { type: "text" };
import planWavePromptText from "./plan-wave.md" with { type: "text" };
import executeWavePromptText from "./execute-wave.md" with { type: "text" };
import verifyPromptText from "./verify.md" with { type: "text" };
import gapLoopPromptText from "./gap-loop.md" with { type: "text" };
import docsBootstrapPromptText from "./docs-bootstrap.md" with { type: "text" };
import artifactSyncPromptText from "./artifact-sync.md" with { type: "text" };
import migrateArchivePromptText from "./migrate-archive.md" with { type: "text" };
import migrateSpecsPromptText from "./migrate-specs.md" with { type: "text" };
import workflowTemplateText from "./templates/workflow.md" with { type: "text" };
import projectTemplateText from "./templates/project.md" with { type: "text" };
import productTemplateText from "./templates/product.md" with { type: "text" };
import techStackTemplateText from "./templates/tech-stack.md" with { type: "text" };
import docsKnowledgeTemplateText from "./templates/docs-knowledge.md" with { type: "text" };
import docsModelingFractalTemplateText from "./templates/docs-modeling-fractal.md" with { type: "text" };
import docsImplFractalTemplateText from "./templates/docs-impl-fractal.md" with { type: "text" };
import projectMemoryTemplateText from "./templates/project-memory.md" with { type: "text" };

// Core prompts
export const stdAgentsPrompt = stdAgentsPromptText;
export const rootAgentsPrompt = rootAgentsPromptText;
export const initPrompt = initPromptText;
export const trackPrompt = trackPromptText;
export const implementPrompt = implementPromptText;
export const validatePrompt = validatePromptText;
export const reviseTrackPrompt = reviseTrackPromptText;
export const archivePrompt = archivePromptText;
export const statusPrompt = statusPromptText;
export const planXmlSpec = planXmlSpecText;
export const protocolsPrompt = protocolsPromptText;
export const discussPrompt = discussPromptText;
export const planWavePrompt = planWavePromptText;
export const executeWavePrompt = executeWavePromptText;
export const verifyPrompt = verifyPromptText;
export const gapLoopPrompt = gapLoopPromptText;
export const docsBootstrapPrompt = docsBootstrapPromptText;
export const artifactSyncPrompt = artifactSyncPromptText;
export const migrateArchivePrompt = migrateArchivePromptText;
export const migrateSpecsPrompt = migrateSpecsPromptText;

// Templates
export const workflowTemplate = workflowTemplateText;
export const projectTemplate = projectTemplateText;
export const productTemplate = productTemplateText;
export const techStackTemplate = techStackTemplateText;
export const docsKnowledgeTemplate = docsKnowledgeTemplateText;
export const docsModelingFractalTemplate = docsModelingFractalTemplateText;
export const docsImplFractalTemplate = docsImplFractalTemplateText;
export const projectMemoryTemplate = projectMemoryTemplateText;

// Export all prompts as a map
export const prompts = {
  agents: stdAgentsPrompt,
  init: initPrompt,
  track: trackPrompt,
  implement: implementPrompt,
  validate: validatePrompt,
  reviseTrack: reviseTrackPrompt,
  archive: archivePrompt,
  status: statusPrompt,
  tasksXmlSpec: planXmlSpec,
  discuss: discussPrompt,
  planWave: planWavePrompt,
  executeWave: executeWavePrompt,
  verify: verifyPrompt,
  gapLoop: gapLoopPrompt,
  docsBootstrap: docsBootstrapPrompt,
  artifactSync: artifactSyncPrompt,
  migrateArchive: migrateArchivePrompt,
  migrateSpecs: migrateSpecsPrompt,
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
