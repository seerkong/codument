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
