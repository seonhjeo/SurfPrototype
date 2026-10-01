import assert from 'node:assert/strict';
import test from 'node:test';
import { makeModeRules } from '../src/game/mode-settings.ts';
import { matchRuleDetails, spRecovery, spRules } from '../src/game/mode-description.ts';

test('SP recovery status distinguishes disabled income from the limit and resumes below it', () => {
  const rules = makeModeRules(5, 1, true);
  assert.equal(spRecovery(rules), '+1 / 초', 'settings show the configured rate');
  for (const amount of [0, 49, 49.999]) assert.equal(spRecovery(rules, amount), '+1 / 초');
  for (const amount of [50, 50.1, 125]) assert.equal(spRecovery(rules, amount), '자동 획득 정지');
  rules.sp.passive.enabled = false;
  for (const amount of [0, 49, 50, 125]) assert.equal(spRecovery(rules, amount), '자동 획득 없음');
  rules.sp.passive.enabled = true; rules.sp.passive.amount = 0;
  assert.equal(spRecovery(rules, 125), '자동 획득 없음');
});

test('rule descriptions distinguish the passive limit from uncapped rewards and initial SP', () => {
  const rules = makeModeRules(60, 1, true);
  const details = new Map(matchRuleDetails(rules));
  assert.equal(details.get('자동 획득 한도'), '50 SP · 보상은 한도 초과 가능');
  assert.equal(details.has('최대 보유 SP'), false);
  assert.equal(details.get('시작 SP'), '60 SP');
  assert.match(spRules(rules), /^시작 60 SP/);
});
