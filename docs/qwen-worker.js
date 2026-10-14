// Pinned runtime. Model inference happens in this worker on the user's GPU.
import {WebWorkerMLCEngineHandler} from 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/+esm';
const handler=new WebWorkerMLCEngineHandler();
self.onmessage=event=>handler.onmessage(event);
