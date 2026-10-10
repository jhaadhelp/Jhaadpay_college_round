import { loadModel, modelState } from '../server/model.js';
const timer = setInterval(() => console.log(modelState.message), 10000);
try { await loadModel(); console.log('AI model downloaded and ready. Future audits use the local cache.'); }
finally { clearInterval(timer); }
