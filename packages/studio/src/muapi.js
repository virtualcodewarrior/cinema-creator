// Backend API compatibility layer for self-hosted mode.
// Re-exports from backendClient.js which calls the Deno backend.

export {
  generateImage,
  generateI2I,
  decomposeLayers,
  generateVideo,
  generateI2V,
  generateMarketingStudioAd,
  processV2V,
  processRecast,
  processLipSync,
  generateAudio,
  uploadFile,
  getUserBalance,
  getHistory,
  deleteMedia,
  getModelById,
  getVideoModelById,
  getI2IModelById,
  getI2VModelById,
  getV2VModelById,
  getRecastModelById,
  getLipSyncModelById,
  getAudioModelById,
  registerAppInterest,
  getAppInterests,
  runClipping,
  runMotionGraphics,
  runMotionGraphicsEdit,
} from './backendClient.js';

// Workflow API stubs (not yet implemented for self-hosted mode).
// List/detail getters must return the raw shapes the studio components consume
// (arrays for lists, node/edge shape for builder data); actions reject with a
// descriptive error instead of faking success.
const WORKFLOWS_UNAVAILABLE = new Error("Workflows are not available in self-hosted mode");
export async function getTemplateWorkflows() { return []; }
export async function getUserWorkflows() { return []; }
export async function getPublishedWorkflows() { return []; }
export async function createWorkflow() { throw WORKFLOWS_UNAVAILABLE; }
export async function updateWorkflowName() { throw WORKFLOWS_UNAVAILABLE; }
export async function deleteWorkflow() { throw WORKFLOWS_UNAVAILABLE; }
export async function getWorkflowInputs() { return { properties: {} }; }
export async function executeWorkflow() { throw WORKFLOWS_UNAVAILABLE; }
export async function getAllNodeSchemas() { return []; }
export async function getWorkflowData() { return { nodes: [], edges: [] }; }

// Agent API stubs (not yet implemented for self-hosted mode)
const AGENTS_UNAVAILABLE = new Error("Agents are not available in self-hosted mode");
export async function getTemplateAgents() { return []; }
export async function getUserAgents() { return []; }
export async function getUserConversations() { return []; }
export async function getAgentBySlug() { throw AGENTS_UNAVAILABLE; }
export async function getAgentConversation() { throw AGENTS_UNAVAILABLE; }
export async function sendAgentChatMessage() { throw AGENTS_UNAVAILABLE; }
export async function pollAgentChatResult() { throw AGENTS_UNAVAILABLE; }
export async function createAgent() { throw AGENTS_UNAVAILABLE; }

// Image processing API stubs (not yet implemented for self-hosted mode)
export async function upscaleImage() { return { ok: true, data: {} }; }
export async function removeBackground() { return { ok: true, data: {} }; }
export async function expandImage() { return { ok: true, data: {} }; }
