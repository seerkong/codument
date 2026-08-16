import * as fs from 'fs';
import { getActiveTrackDir, getTrackAuthority, getTracks, getSpecs, codumentExists, formatStatus, walkTrackTasks } from '../utils';

export async function statusCommand(args: string[]) {
  if (!codumentExists()) {
    console.error('Codument is not initialized. Run codument init first.');
    process.exit(1);
  }

  const tracks = getTracks();
  const specs = getSpecs();

  // Calculate statistics
  const totalTracks = tracks.length;
  const completedTracks = tracks.filter(t => t.metadata.status === 'completed').length;
  const inProgressTracks = tracks.filter(t => t.metadata.status === 'in_progress').length;
  const newTracks = tracks.filter(t => t.metadata.status === 'new').length;

  let totalTasks = 0;
  let completedTasks = 0;
  let inProgressTasks = 0;
  let todoTasks = 0;
  let blockedTasks = 0;

  for (const track of tracks) {
    if (track.taskSummary) {
      totalTasks += track.taskSummary.total_tasks;
      completedTasks += track.taskSummary.completed;
      inProgressTasks += track.taskSummary.in_progress;
      todoTasks += track.taskSummary.todo;
      blockedTasks += track.taskSummary.blocked;
    }
  }

  const overallProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Find current track and task
  const currentTrack = tracks.find(t => t.metadata.status === 'in_progress');
  let currentPhase = '';
  let currentTask = '';
  let nextTask = '';

  if (currentTrack) {
    const file = getTrackAuthority(getActiveTrackDir(currentTrack.id))?.file;
    if (file && fs.existsSync(file)) {
      for (const task of walkTrackTasks(file)) {
        if (!currentTask && task.status === 'ACTIVE') {
          currentPhase = task.phaseName;
          currentTask = task.name;
        }
        if (!nextTask && task.status === 'NOT_STARTED') {
          nextTask = task.name;
        }
        if (currentTask && nextTask) {
          break;
        }
      }
    }
  }

  // Determine project status
  let projectStatus = 'On Track';
  if (blockedTasks > 0) {
    projectStatus = 'Blocked';
  } else if (totalTracks === 0) {
    projectStatus = 'No Tracks';
  } else if (completedTracks === totalTracks) {
    projectStatus = 'Complete';
  }

  // Print status
  const now = new Date().toISOString().replace('T', ' ').split('.')[0];

  console.log('\n' + '═'.repeat(60));
  console.log('                    Codument Project Status');
  console.log('═'.repeat(60));

  console.log(`\n📅 Time: ${now}`);
  console.log(`📊 Status: ${projectStatus}`);

  console.log('\n' + '─'.repeat(60));
  console.log('                       Tracks Overview');
  console.log('─'.repeat(60));

  if (tracks.length === 0) {
    console.log('\n  No tracks found. Use "codument track" to create one.\n');
  } else {
    console.log('\n  Status  Track                              Progress');
    console.log('  ' + '-'.repeat(56));

    for (const track of tracks) {
      const status = formatStatus(track.metadata.status);
      const id = track.id.length > 32 ? track.id.slice(0, 29) + '...' : track.id.padEnd(32);

      let progress = '-';
      if (track.taskSummary) {
        const { completed, total_tasks } = track.taskSummary;
        const pct = total_tasks > 0 ? Math.round((completed / total_tasks) * 100) : 0;
        progress = `${completed}/${total_tasks} (${pct}%)`;
      }

      console.log(`  ${status}   ${id}  ${progress}`);
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log('                       Current Progress');
  console.log('─'.repeat(60));

  if (currentTrack) {
    console.log(`\n🎯 Current Track: ${currentTrack.id}`);
    if (currentPhase) console.log(`   Current Phase: ${currentPhase}`);
    if (currentTask) console.log(`   Current Task: ${currentTask}`);
    if (nextTask) console.log(`\n📋 Next: ${nextTask}`);
  } else {
    console.log('\n  No track in progress.');
  }

  if (blockedTasks > 0) {
    console.log(`\n⚠️  Blocked: ${blockedTasks} task(s)`);
  }

  console.log('\n' + '─'.repeat(60));
  console.log('                        Statistics');
  console.log('─'.repeat(60));

  console.log(`\nTracks:  ${totalTracks} total | ${inProgressTracks} in progress | ${newTracks} new | ${completedTracks} completed`);
  console.log(`Tasks:   ${totalTasks} total | ${completedTasks} done | ${inProgressTasks} in progress | ${todoTasks} todo`);

  // Progress bar
  const barWidth = 20;
  const filled = Math.round((overallProgress / 100) * barWidth);
  const empty = barWidth - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);

  console.log(`Progress: ${bar} ${overallProgress}%`);

  console.log('\n' + '═'.repeat(60) + '\n');
}
