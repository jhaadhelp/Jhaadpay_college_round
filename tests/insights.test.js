import test from 'node:test';
import assert from 'node:assert/strict';
import { confidenceCues, evidenceNeeded, coverageSegments } from '../src/insights.js';

test('coverage preserves the entire original answer, including unchecked gaps and whitespace', () => {
  const answer = '  First claim.\nUnchecked fragment\nSecond claim.  ';
  const start = answer.indexOf('Second');
  const parts = coverageSegments(answer,[{ id:'c2',start,end:start+13,status:'insufficient' },{ id:'c1',start:2,end:14,status:'supported' }]);
  assert.equal(parts.map(p=>p.text).join(''),answer);
  assert.equal(parts.filter(p=>p.claim).length,2);
  assert.ok(parts.some(p=>!p.claim && p.text.includes('Unchecked fragment')));
});
test('bad or overlapping offsets cannot omit or duplicate answer text', () => {
  const text='A short claim.';
  const parts=coverageSegments(text,[{start:0,end:7},{start:3,end:8},{start:7,end:200}]);
  assert.equal(parts.map(p=>p.text).join(''),text);
});
test('confidence prompts flag certainty alongside qualified evidence without changing the verdict', () => {
  const claim={text:'The pilot proved everyone will improve.',status:'insufficient',evidence:[{quote:'Preliminary results suggest some participants might improve.'}]};
  const before=JSON.stringify(claim);
  const cues=confidenceCues(claim);
  assert.equal(cues.length,1);
  assert.ok(cues[0].quote.includes('Preliminary'));
  assert.equal(JSON.stringify(claim),before);
  assert.deepEqual(confidenceCues({...claim,status:'supported'}),[]);
  assert.deepEqual(confidenceCues({...claim,text:'The pilot may help.'}),[]);
});
test('evidence prompts distinguish missing outcomes, arithmetic and conflicting sources', () => {
  assert.match(evidenceNeeded({status:'insufficient',text:'Long-term retention improved.'}),/follow-up measurements/);
  assert.match(evidenceNeeded({status:'contradicted',text:'Growth was 30%.',checks:[{}]}),/recalculate/);
  assert.match(evidenceNeeded({status:'ambiguous',text:'There were 120 participants.'}),/competing passages/);
  assert.equal(evidenceNeeded({status:'supported',text:'There were 120 participants.'}),null);
});
test('future evidence prompts do not claim forecasts establish future truth', () => {
  assert.match(evidenceNeeded({status:'insufficient',text:'The product will lead the market next year.'}),/cannot establish a future outcome/);
});
