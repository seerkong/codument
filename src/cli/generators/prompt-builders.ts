export function withLeadingArgs(prompt: string, argsToken: string): string {
  return `${argsToken}\n\n${prompt}\n`;
}

export function withTrackRequest(prompt: string, argsToken?: string): string {
  return [
    prompt,
    '',
    'The user has requested the following change track.',
    ...(argsToken ? ['', argsToken] : []),
    '',
  ].join('\n');
}

export function withImplementRequest(prompt: string, argsToken?: string): string {
  return [
    prompt,
    '',
    'The user has requested to implement the following change track.',
    'Find the change track and follow the instructions below.',
    "If you're not sure or if ambiguous, ask for clarification from the user.",
    ...(argsToken ? ['', argsToken] : []),
    '',
  ].join('\n');
}

export function withChangeId(prompt: string, argsToken?: string): string {
  return [
    prompt,
    '',
    '<ChangeId>',
    ...(argsToken ? [`  ${argsToken}`] : []),
    '</ChangeId>',
    '',
  ].join('\n');
}

export function withGapLoopRequest(
  prompt: string,
  argsToken: string,
  orchestrationRules: string[]
): string {
  return [
    argsToken,
    '',
    'Tool-specific orchestration rules for this gap-loop run:',
    ...orchestrationRules.map((rule) => `- ${rule}`),
    '',
    prompt,
    '',
  ].join('\n');
}

export function buildSkillWrapperBody(options: {
  commandId: string;
  skillDisplayPath: string;
  subskillName: string;
  argsToken?: string;
  extraRules?: string[];
}): string {
  const sections = [
    `# codument:${options.commandId}`,
    '',
    'Use the generated `codument-workflow` skill as the single source of truth for this command.',
    '',
    'Load these files before acting:',
    `- \`${options.skillDisplayPath}shared/target-capabilities.md\``,
    `- \`${options.skillDisplayPath}shared/subagent-model.md\``,
    `- \`${options.skillDisplayPath}subskills/${options.subskillName}/SKILL.md\``,
    '',
    'Then execute the referenced sub-skill for the current workspace and treat the payload below as the user request for that sub-skill.',
  ];

  if (options.extraRules && options.extraRules.length > 0) {
    sections.push('', 'Wrapper-specific notes:');
    sections.push(...options.extraRules.map((rule) => `- ${rule}`));
  }

  if (options.argsToken) {
    sections.push('', 'Request:', options.argsToken);
  }

  sections.push('');
  return sections.join('\n');
}
