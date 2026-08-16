from fastapi import APIRouter, Request, HTTPException, UploadFile, File
from typing import Any
import httpx
import os
import urllib.parse
import json
import uuid
from pathlib import Path

DENO_BACKEND_URL = os.getenv("DENO_BACKEND_URL", "http://localhost:8000")
DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "creative-agent"
DATA_DIR.mkdir(parents=True, exist_ok=True)

router = APIRouter()
app_router = APIRouter()

def _get_api_key():
    return os.getenv("MU_API_KEY", "")

async def proxy_request_helper(method: str, url: str, payload: dict = None):
    api_key = _get_api_key()
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["x-api-key"] = api_key
    async with httpx.AsyncClient() as client:
        try:
            if payload:
                response = await client.request(method, url, json=payload, headers=headers, timeout=30.0)
            else:
                response = await client.request(method, url, headers=headers, timeout=30.0)
            return {"status": response.status_code, "data": response.json() if response.headers.get("content-type", "").startswith("application/json") else response.text}
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Backend error: {str(e)}")

def _save_data(key: str, data: dict):
    filepath = DATA_DIR / f"{key}.json"
    with open(filepath, "w") as f:
        json.dump(data, f)

def _load_data(key: str) -> dict:
    filepath = DATA_DIR / f"{key}.json"
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Data not found")
    with open(filepath, "r") as f:
        return json.load(f)

def _list_data(pattern: str) -> list:
    result = []
    for filepath in DATA_DIR.glob(f"{pattern}.json"):
        with open(filepath, "r") as f:
            result.append(json.load(f))
    return result

def _delete_data(key: str) -> bool:
    filepath = DATA_DIR / f"{key}.json"
    if not filepath.exists():
        return False
    filepath.unlink()
    return True

@router.get("/sessions")
async def get_sessions():
    return _list_data("session")

@router.post("/sessions")
async def create_session(request: Request):
    try:
        payload = await request.json()
    except:
        payload = {}
    session_id = str(uuid.uuid4())
    payload["id"] = session_id
    _save_data(f"session_{session_id}", payload)
    return {"id": session_id, **payload}

@router.patch("/sessions/{session_id}")
async def update_session(session_id: str, request: Request):
    payload = await request.json()
    data = _load_data(f"session_{session_id}")
    data.update(payload)
    _save_data(f"session_{session_id}", data)
    return data

@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    return {"deleted": _delete_data(f"session_{session_id}")}

@router.get("/sessions/{session_id}/messages")
async def get_session_messages(session_id: str):
    data = _load_data(f"session_{session_id}")
    return data.get("messages", [])

@router.patch("/sessions/{session_id}/messages")
async def update_session_messages(session_id: str, request: Request):
    payload = await request.json()
    data = _load_data(f"session_{session_id}")
    data["messages"] = payload.get("messages", data.get("messages", []))
    _save_data(f"session_{session_id}", data)
    return data

@router.post("/sessions/{session_id}/chat")
async def chat(session_id: str, request: Request):
    payload = await request.json()
    data = _load_data(f"session_{session_id}")
    messages = data.get("messages", [])
    messages.append({"role": "user", "content": payload.get("message", "")})
    data["messages"] = messages
    _save_data(f"session_{session_id}", data)
    return {"reply": "Chat requires an LLM backend"}

@router.get("/sessions/{session_id}/assets")
async def get_session_assets(session_id: str):
    data = _load_data(f"session_{session_id}")
    return data.get("assets", [])

@router.post("/sessions/{session_id}/assets")
async def register_session_asset(session_id: str, request: Request):
    payload = await request.json()
    data = _load_data(f"session_{session_id}")
    assets = data.get("assets", [])
    assets.append(payload)
    data["assets"] = assets
    _save_data(f"session_{session_id}", data)
    return payload

@router.post("/jobs/{job_id}/approve")
async def approve_job(job_id: str, request: Request):
    try:
        payload = await request.json()
    except:
        payload = {}
    data = _load_data(f"job_{job_id}")
    data["status"] = "approved"
    _save_data(f"job_{job_id}", data)
    return data

@router.post("/jobs/{job_id}/reject")
async def reject_job(job_id: str, request: Request):
    try:
        payload = await request.json()
    except:
        payload = {}
    data = _load_data(f"job_{job_id}")
    data["status"] = "rejected"
    _save_data(f"job_{job_id}", data)
    return data

@router.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str, request: Request):
    try:
        payload = await request.json()
    except:
        payload = {}
    data = _load_data(f"job_{job_id}")
    data["status"] = "cancelled"
    _save_data(f"job_{job_id}", data)
    return data

@router.get("/jobs/{job_id}/status")
async def get_job_status(job_id: str):
    data = _load_data(f"job_{job_id}")
    return {"job_id": job_id, "status": data.get("status", "unknown")}

@router.get("/jobs/{job_id}/events")
async def get_job_events(job_id: str, request: Request):
    data = _load_data(f"job_{job_id}")
    return data.get("events", [])

@router.get("/sessions/{session_id}/jobs")
async def get_session_jobs(session_id: str):
    return _list_data(f"job_{session_id}")

@router.get("/agent-skills")
async def get_agent_skills():
    return []

@router.post("/sessions/{session_id}/run-skill")
async def run_skill(session_id: str, request: Request):
    payload = await request.json()
    return {"skill": payload.get("skill", ""), "status": "completed"}

@router.get("/account/balance")
async def get_account_balance():
    api_key = _get_api_key()
    if not api_key:
        return {"balance": 0, "currency": "credits"}
    try:
        url = f"{DENO_BACKEND_URL}/api/v1/account/balance"
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers={"x-api-key": api_key}, timeout=10.0)
            return response.json()
    except:
        return {"balance": 0, "currency": "credits"}

@app_router.get("/get_upload_url")
async def get_upload_url(request: Request):
    params = dict(request.query_params)
    api_key = _get_api_key()
    url = f"{DENO_BACKEND_URL}/api/upload"
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=params, headers={"x-api-key": api_key}, timeout=30.0)
        return response.json()

@app_router.post("/upload-binary")
async def upload_binary(request: Request):
    try:
        form = await request.form()
        file_bytes = None
        file_name = "file"
        content_type = "application/octet-stream"
        for key, value in form.items():
            if key == "file":
                if hasattr(value, "read") and hasattr(value, "filename"):
                    file_bytes = await value.read()
                    file_name = value.filename
                    content_type = value.content_type
                else:
                    file_bytes = value if isinstance(value, bytes) else str(value).encode()
        if not file_bytes:
            raise HTTPException(status_code=400, detail="Missing file in form data")
        api_key = _get_api_key()
        url = f"{DENO_BACKEND_URL}/api/upload"
        async with httpx.AsyncClient() as client:
            files = {"file": (file_name, file_bytes, content_type)}
            response = await client.post(url, files=files, headers={"x-api-key": api_key}, timeout=60.0)
            return response.json()
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=400, detail=str(e))
