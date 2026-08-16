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

// Workflow API stubs (not yet implemented for self-hosted mode)
export async function getTemplateWorkflows() { return { ok: true, data: [] }; }
export async function getUserWorkflows() { return { ok: true, data: [] }; }
export async function getPublishedWorkflows() { return { ok: true, data: [] }; }
export async function createWorkflow() { return { ok: true, data: {} }; }
export async function updateWorkflowName() { return { ok: true, data: {} }; }
export async function deleteWorkflow() { return { ok: true, data: {} }; }
export async function getWorkflowInputs() { return { ok: true, data: [] }; }
export async function executeWorkflow() { return { ok: true, data: {} }; }
export async function getAllNodeSchemas() { return { ok: true, data: {} }; }
export async function getWorkflowData() { return { ok: true, data: {} }; }

// Agent API stubs (not yet implemented for self-hosted mode)
export async function getTemplateAgents() { return { ok: true, data: [] }; }
export async function getUserAgents() { return { ok: true, data: [] }; }
export async function getUserConversations() { return { ok: true, data: [] }; }
export async function getAgentBySlug() { return { ok: true, data: {} }; }
export async function getAgentConversation() { return { ok: true, data: [] }; }
export async function sendAgentChatMessage() { return { ok: true, data: {} }; }
export async function pollAgentChatResult() { return { ok: true, data: {} }; }
export async function createAgent() { return { ok: true, data: {} }; }

// Image processing API stubs (not yet implemented for self-hosted mode)
export async function upscaleImage() { return { ok: true, data: {} }; }
export async function removeBackground() { return { ok: true, data: {} }; }
export async function expandImage() { return { ok: true, data: {} }; }
