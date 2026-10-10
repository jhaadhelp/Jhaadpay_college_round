import path from 'node:path';
import { stat } from 'node:fs/promises';
export const MODEL = 'Xenova/nli-deberta-v3-xsmall';
export const REVISION = '2a4f614a701367a02d51389039afc998faeda637';
let instance, loading;
export const modelState = { status: 'idle', message: 'Ready to load local AI model', progress: 0, model: MODEL, revision: REVISION };
export async function loadModel() {
  if (instance) return instance;
  if (loading) return loading;
  loading = (async () => {
    modelState.status = 'loading';
    modelState.message = 'Downloading or loading the local AI model. The first run takes longer.';
    const { AutoTokenizer, AutoModelForSequenceClassification, env } = await import('@huggingface/transformers');
    env.cacheDir = path.resolve(process.env.MODEL_CACHE_DIR || '.cache/models');
    // Load the immutable snapshot by directory. Transformers 4's tokenizer
    // metadata probe otherwise checks remote main, ignoring the revision option.
    const snapshot = path.join(env.cacheDir, MODEL, REVISION);
    const required = ['tokenizer.json', 'tokenizer_config.json', 'config.json', 'onnx/model_quantized.onnx'];
    const cached = (await Promise.all(required.map(file => stat(path.join(snapshot, file)).then(s => s.isFile() && s.size > 0).catch(() => false)))).every(Boolean);
    env.allowLocalModels = true;
    env.allowRemoteModels = !cached;
    const location = cached ? snapshot : MODEL;
    modelState.message = cached ? 'Loading the downloaded AI model from this device.' : 'Downloading the AI model. Internet is required for this first setup.';
    const options = { revision: REVISION, local_files_only: cached, progress_callback: p => {
      if (p.status === 'progress' && /onnx/.test(p.file || '')) {
        modelState.progress = Math.round(p.progress || 0);
        modelState.message = `Loading AI model: ${modelState.progress}%`;
      }
    } };
    const tokenizer = await AutoTokenizer.from_pretrained(location, options);
    const model = await AutoModelForSequenceClassification.from_pretrained(location, { ...options, dtype: 'q8', device: 'cpu' });
    instance = { tokenizer, model };
    modelState.status = 'ready'; modelState.progress = 100; modelState.message = 'Local AI model ready';
    return instance;
  })().catch(error => {
    loading = undefined; modelState.status = 'error'; modelState.message = 'Model could not load. Run npm run model:download with internet access to complete or repair model setup, then retry.';
    throw new Error(`Local model unavailable: ${error.message}`);
  });
  return loading;
}
export async function classify(premise, hypothesis) {
  const { tokenizer, model } = await loadModel();
  const input = tokenizer(premise, { text_pair: hypothesis, truncation: false, padding: true });
  if (input.input_ids.dims[1] > 512) return { entailment: 0, contradiction: 0, neutral: 1, skipped: 'This pair exceeds the model context window.' };
  const result = await model(input);
  const logits = Array.from(result.logits.data), peak = Math.max(...logits);
  const exps = logits.map(v => Math.exp(v - peak)), sum = exps.reduce((a, b) => a + b, 0);
  const scores = {};
  exps.forEach((v, i) => { scores[String(model.config.id2label[i]).toLowerCase()] = v / sum; });
  if (!Number.isFinite(scores.entailment) || !Number.isFinite(scores.contradiction)) throw new Error('The model returned an unexpected label schema.');
  return scores;
}
