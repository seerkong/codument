import { getTracks, getSpecs, parseOptions, formatStatus, codumentExists } from '../utils';

export async function listCommand(args: string[]) {
  if (!codumentExists()) {
    console.error('Codument is not initialized. Run codument init first.');
    process.exit(1);
  }

  const { options } = parseOptions(args);
  const showSpecs = options['behaviors'] === true || options['specs'] === true;
  const jsonOutput = options['json'] === true;

  if (showSpecs) {
    const specs = getSpecs();

    if (jsonOutput) {
      console.log(JSON.stringify(specs, null, 2));
      return;
    }

    if (specs.length === 0) {
      console.log('No specifications found.');
      return;
    }

    console.log('\nSpecifications:\n');
    console.log('  ID                          Format      Requirements  Scenarios');
    console.log('  ' + '-'.repeat(72));

    for (const spec of specs) {
      const id = spec.id.padEnd(28);
      const format = (spec.format || 'markdown').padEnd(12);
      const reqs = String(spec.requirements).padStart(8);
      const scenarios = String(spec.scenarios).padStart(10);
      console.log(`  ${id}${format}${reqs}${scenarios}`);
    }

    console.log(`\nTotal: ${specs.length} spec(s)\n`);
  } else {
    const tracks = getTracks();

    if (jsonOutput) {
      console.log(JSON.stringify(tracks, null, 2));
      return;
    }

    if (tracks.length === 0) {
      console.log('No active tracks found.');
      return;
    }

    console.log('\nActive Tracks:\n');
    console.log('  Status  ID                              Type      Progress');
    console.log('  ' + '-'.repeat(68));

    for (const track of tracks) {
      const status = formatStatus(track.metadata.status);
      const id = track.id.padEnd(32);
      const type = track.metadata.type.padEnd(10);

      let progress = '-';
      if (track.taskSummary) {
        const { completed, total_tasks } = track.taskSummary;
        const pct = total_tasks > 0 ? Math.round((completed / total_tasks) * 100) : 0;
        progress = `${completed}/${total_tasks} (${pct}%)`;
      }

      console.log(`  ${status}   ${id}${type}${progress}`);
    }

    console.log(`\nTotal: ${tracks.length} track(s)\n`);
  }
}
