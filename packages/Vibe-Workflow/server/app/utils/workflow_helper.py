import os
import json
import httpx
import logging
import uuid
from fastapi import HTTPException
from typing import Optional
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
WORKFLOW_DIR = BASE_DIR / "data" / "workflows"
WORKFLOW_DIR.mkdir(parents=True, exist_ok=True)

DENO_BACKEND_URL = os.getenv("DENO_BACKEND_URL", "http://localhost:8000")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def _get_api_key():
    return os.getenv("MU_API_KEY", "")

async def proxy_request_to_deno(method: str, endpoint: str, payload: Optional[dict] = None, api_key: str = ""):
    url = f"{DENO_BACKEND_URL}{endpoint}"
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["x-api-key"] = api_key
    async with httpx.AsyncClient() as client:
        try:
            if method.upper() == "GET":
                response = await client.get(url, headers=headers, timeout=60.0)
            elif method.upper() == "POST":
                response = await client.post(url, json=payload, headers=headers, timeout=60.0)
            elif method.upper() == "DELETE":
                response = await client.delete(url, headers=headers, timeout=60.0)
            else:
                raise HTTPException(status_code=405, detail=f"Method {method} not supported")
        except httpx.RequestError as e:
            logger.error(f"HTTP Request Error for {method} {url}: {e}")
            raise HTTPException(status_code=502, detail=f"Backend error: {str(e)}")
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    try:
        return response.json()
    except ValueError:
        return {"detail": response.text or "Unknown error"}

def _save_workflow(workflow_id: str, workflow_data: dict):
    workflow_file = WORKFLOW_DIR / f"{workflow_id}.json"
    with open(workflow_file, "w") as f:
        json.dump(workflow_data, f, indent=2)
    return {"id": workflow_id, "saved": True}

def _load_workflow(workflow_id: str) -> dict:
    workflow_file = WORKFLOW_DIR / f"{workflow_id}.json"
    if not workflow_file.exists():
        raise HTTPException(status_code=404, detail="Workflow not found")
    with open(workflow_file, "r") as f:
        return json.load(f)

def _list_workflows() -> list:
    workflows = []
    for workflow_file in WORKFLOW_DIR.glob("*.json"):
        with open(workflow_file, "r") as f:
            workflow_data = json.load(f)
            workflow_data["_id"] = workflow_file.stem
            workflow_data["_filename"] = workflow_file.name
            workflows.append(workflow_data)
    return workflows

def _delete_workflow(workflow_id: str) -> bool:
    workflow_file = WORKFLOW_DIR / f"{workflow_id}.json"
    if not workflow_file.exists():
        return False
    workflow_file.unlink()
    return True

async def create_or_update_workflow(payload: dict):
    workflow_id = payload.get("id", str(uuid.uuid4()))
    return _save_workflow(workflow_id, payload)

async def get_node_schemas_helper(workflow_id: str):
    try:
        workflow = _load_workflow(workflow_id)
        return workflow.get("nodeSchemas", {})
    except HTTPException:
        return {}

async def get_api_node_schemas_helper(workflow_id: str):
    try:
        workflow = _load_workflow(workflow_id)
        return workflow.get("apiNodeSchemas", {})
    except HTTPException:
        return {}

async def get_workflow_def_helper(workflow_id: str):
    return _load_workflow(workflow_id)

async def get_workflow_defs_helper():
    return _list_workflows()

async def delete_workflow_def_by_id(workflow_id: str):
    return {"deleted": _delete_workflow(workflow_id)}

async def update_workflow_name_helper(workflow_id: str, payload: dict):
    workflow = _load_workflow(workflow_id)
    workflow["name"] = payload.get("name", workflow.get("name", ""))
    return _save_workflow(workflow_id, workflow)

async def _execute_node(node: dict, global_params: dict) -> dict:
    node_type = node.get("type", "text")
    node_id = node.get("id", "unknown")
    api_key = _get_api_key()
    if node_type == "text":
        return {"node_id": node_id, "output": node.get("value", ""), "status": "completed"}
    elif node_type == "image":
        result = await proxy_request_to_deno("POST", "/api/generate", {"prompt": node.get("value", ""), "model": node.get("model", "flux-pro")}, api_key)
        return {"node_id": node_id, "output": result, "status": "completed"}
    else:
        return {"node_id": node_id, "output": node.get("value", ""), "status": "completed"}

async def run_workflow_helper(workflow_id: str, payload: dict):
    try:
        workflow = _load_workflow(workflow_id)
    except HTTPException:
        raise HTTPException(status_code=404, detail="Workflow not found")
    run_id = str(uuid.uuid4())
    results = []
    for node in workflow.get("nodes", []):
        node_result = await _execute_node(node, payload)
        results.append(node_result)
    return {"run_id": run_id, "status": "completed", "results": results}

async def get_run_status_helper(run_id: str):
    return {"run_id": run_id, "status": "completed"}

async def run_node_helper(workflow_id: str, node_id: str, payload: dict):
    try:
        workflow = _load_workflow(workflow_id)
    except HTTPException:
        raise HTTPException(status_code=404, detail="Workflow not found")
    node = next((n for n in workflow.get("nodes", []) if n.get("id") == node_id), None)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return await _execute_node(node, payload)

async def publish_workflow_helper(workflow_id: str, payload: dict):
    return await create_or_update_workflow(payload)

async def template_workflow_helper(workflow_id: str, payload: dict):
    workflow = _load_workflow(workflow_id)
    template_id = str(uuid.uuid4())
    template = {**workflow, "id": template_id, "is_template": True}
    return _save_workflow(template_id, template)

async def cloudfront_signed_url_helper(payload: dict):
    api_key = _get_api_key()
    return await proxy_request_to_deno("POST", "/api/upload", payload, api_key)

async def generate_thumbnail_helper(workflow_id: str, payload: dict):
    api_key = _get_api_key()
    return await proxy_request_to_deno("POST", "/api/generate", payload, api_key)

async def get_file_upload_url_helper(params: dict):
    api_key = _get_api_key()
    return await proxy_request_to_deno("POST", "/api/upload", params, api_key)

async def get_workflow_last_run(workflow_id: str):
    return None

async def architect_workflow_helper(payload: dict):
    return {"architect_id": str(uuid.uuid4()), "workflow": payload}

async def poll_architect_result_helper(id: str):
    return {"status": "completed", "result": {}}

async def delete_node_run_by_id_helper(node_run_id: str):
    return {"deleted": True}

async def update_workflow_category_helper(workflow_id: str, payload: dict):
    workflow = _load_workflow(workflow_id)
    workflow["category"] = payload.get("category", workflow.get("category", ""))
    return _save_workflow(workflow_id, workflow)

async def get_workflow_api_inputs_helper(workflow_id: str):
    try:
        workflow = _load_workflow(workflow_id)
        return workflow.get("apiInputs", {})
    except HTTPException:
        return {}

async def execute_workflow_via_api_helper(workflow_id: str, payload: dict):
    return await run_workflow_helper(workflow_id, payload)

async def get_workflow_api_outputs_helper(run_id: str):
    return {"run_id": run_id, "outputs": []}
