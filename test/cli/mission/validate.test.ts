import { describe, expect, it } from 'bun:test';
import { validateMissionXml } from '../../../src/cli/mission/validate';

function errors(xml: string): string[] {
  return validateMissionXml(xml)
    .filter((finding) => finding.severity === 'error')
    .map((finding) => finding.message);
}

const VALID_MISSION = `<Mission id="feedback-loop" version="1" xmlns:cdt="urn:codument:v1">
  <cdt:ProjectRefs>
    <cdt:ProjectRef id="host" kind="host"/>
    <cdt:ProjectRef id="library" kind="external"/>
  </cdt:ProjectRefs>
  <cdt:ActorSets default="default-control-loop">
    <cdt:ActorSet id="default-control-loop">
      <cdt:Actor role="MissionPlanner" project-ref="host"><Description>Plan host tracks.</Description></cdt:Actor>
      <cdt:Actor role="MissionObserver" project-ref="host"><Description>Observe host evidence.</Description></cdt:Actor>
      <cdt:Actor role="MissionReconciler" project-ref="host"><Description>Reconcile host drift.</Description></cdt:Actor>
      <cdt:Actor role="MissionApplier" project-ref="host"><Description>Apply one host action.</Description></cdt:Actor>
    </cdt:ActorSet>
    <cdt:ActorSet id="library-feedback-loop">
      <cdt:Actor role="MissionPlanner" project-ref="library"><Description>Plan library feedback.</Description></cdt:Actor>
      <cdt:Actor role="MissionObserver" project-ref="library"><Description>Observe library evidence.</Description></cdt:Actor>
      <cdt:Actor role="MissionReconciler" project-ref="library"><Description>Reconcile library drift.</Description></cdt:Actor>
      <cdt:Actor role="MissionApplier" project-ref="library"><Description>Apply one library action.</Description></cdt:Actor>
    </cdt:ActorSet>
  </cdt:ActorSets>
  <TaskSpace id="space_feedback-loop" name="feedback-loop" version="1">
    <SubNodes>
      <TaskGroup id="G1" name="host work" status="NOT_STARTED" order="0">
        <SubNodes>
          <Task id="G1-T1" name="host track" status="NOT_STARTED" order="0">
            <cdt:TrackLink state="candidate" id="host-track" project-ref="host"/>
          </Task>
        </SubNodes>
      </TaskGroup>
      <TaskGroup id="G2" name="library feedback" status="NOT_STARTED" order="1" cdt:actor-set="library-feedback-loop">
        <SubNodes>
          <Task id="G2-T1" name="library track" status="NOT_STARTED" order="0">
            <cdt:TrackLink state="candidate" id="library-track" project-ref="library"/>
          </Task>
        </SubNodes>
      </TaskGroup>
    </SubNodes>
  </TaskSpace>
</Mission>`;

describe('validateMissionXml ActorSet and ProjectRef contract', () => {
  it('accepts complete default and TaskGroup override ActorSets with host and external ProjectRefs', () => {
    expect(errors(VALID_MISSION)).toEqual([]);
  });

  it('requires each ActorSet to contain each of the four roles exactly once', () => {
    const missingRole = VALID_MISSION.replace(
      '      <cdt:Actor role="MissionApplier" project-ref="host"><Description>Apply one host action.</Description></cdt:Actor>\n',
      '',
    );
    const duplicateRole = VALID_MISSION.replace(
      'role="MissionApplier" project-ref="host"',
      'role="MissionPlanner" project-ref="host"',
    );

    expect(errors(missingRole).join('\n')).toMatch(/MissionApplier/);
    expect(errors(duplicateRole).join('\n')).toMatch(/MissionPlanner/);
  });

  it('requires each Actor to declare mission-specific work rather than repeat the standard role protocol', () => {
    const withoutWork = VALID_MISSION.replace(
      '<Description>Plan host tracks.</Description>',
      '',
    );

    expect(errors(withoutWork).join('\n')).toMatch(/MissionPlanner.*Description|Description.*MissionPlanner/i);
  });

  it('requires a declared default ActorSet and a TaskGroup override that names a complete set', () => {
    const unknownDefault = VALID_MISSION.replace('default="default-control-loop"', 'default="missing-set"');
    const unknownOverride = VALID_MISSION.replace(
      'cdt:actor-set="library-feedback-loop"',
      'cdt:actor-set="missing-set"',
    );

    expect(errors(unknownDefault).join('\n')).toMatch(/default.*missing-set|missing-set.*default/i);
    expect(errors(unknownOverride).join('\n')).toMatch(/actor-set.*missing-set|missing-set.*actor-set/i);
  });

  it('requires unique, path-free ProjectRefs', () => {
    const duplicate = VALID_MISSION.replace(
      '<cdt:ProjectRef id="library" kind="external"/>',
      '<cdt:ProjectRef id="host" kind="external"/>',
    );
    const persistedPath = VALID_MISSION.replace(
      '<cdt:ProjectRef id="library" kind="external"/>',
      '<cdt:ProjectRef id="library" kind="external" path="/Users/example/library"/>',
    );
    const persistedWorkspace = VALID_MISSION.replace(
      'xmlns:cdt="urn:codument:v1">',
      'xmlns:cdt="urn:codument:v1" workspace="/Users/example">',
    );

    expect(errors(duplicate).join('\n')).toMatch(/ProjectRef.*host|host.*ProjectRef/i);
    expect(errors(persistedPath).join('\n')).toMatch(/path/i);
    expect(errors(persistedWorkspace).join('\n')).toMatch(/workspace/i);
  });

  it('accepts only host and external ProjectRef kinds', () => {
    const unknownKind = VALID_MISSION.replace(
      'id="library" kind="external"',
      'id="library" kind="remote"',
    );

    expect(errors(unknownKind).join('\n')).toMatch(/ProjectRef.*kind|kind.*ProjectRef/i);
  });

  it('requires every Actor and TrackLink project-ref to resolve to a declared ProjectRef', () => {
    const unknownActorProject = VALID_MISSION.replace(
      'role="MissionObserver" project-ref="host"',
      'role="MissionObserver" project-ref="missing-project"',
    );
    const unknownTrackProject = VALID_MISSION.replace(
      'id="library-track" project-ref="library"',
      'id="library-track" project-ref="missing-project"',
    );

    expect(errors(unknownActorProject).join('\n')).toMatch(/missing-project/);
    expect(errors(unknownTrackProject).join('\n')).toMatch(/missing-project/);
  });
});
