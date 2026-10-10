import assert from 'node:assert/strict';

// Run as a fresh process after model:download/test:model. No warm singleton or
// successful network request may hide a cold-start dependency on the model host.
let requests = 0;
globalThis.fetch = async () => {
  requests++;
  throw new Error('Network disabled by offline regression test');
};
const { classify, modelState } = await import('../server/model.js');
const { env } = await import('@huggingface/transformers');
env.fetch = globalThis.fetch;
const scores = await classify('The trial included 120 adults.', 'The trial included adults.');
assert.equal(modelState.status, 'ready');
assert.ok(scores.entailment > 0.86, `Expected real-model entailment, got ${JSON.stringify(scores)}`);
assert.equal(requests, 0, 'A cached cold start must not attempt any network requests');
console.log('PASS: cold-start local AI inference with zero network requests.');
