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
export const tasksXmlSpec = loadPrompt("tasks-xml-spec.md");

// Templates
export const workflowTemplate = loadTemplate("workflow.md");
export const projectTemplate = loadTemplate("project.md");
export const productTemplate = loadTemplate("product.md");
export const techStackTemplate = loadTemplate("tech-stack.md");
export const tracksTemplate = loadTemplate("tracks.md");

// Export all prompts as a map
export const prompts = {
  agents: stdAgentsPrompt,
  init: initPrompt,
  track: trackPrompt,
  implement: implementPrompt,
  validate: validatePrompt,
  archive: archivePrompt,
  status: statusPrompt,
  tasksXmlSpec: tasksXmlSpec,
};

// Export all templates as a map
export const templates = {
  workflow: workflowTemplate,
  project: projectTemplate,
  product: productTemplate,
  techStack: techStackTemplate,
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
