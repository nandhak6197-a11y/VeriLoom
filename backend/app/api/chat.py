# -*- coding: utf-8 -*-
"""API Endpoints for VeriLoom Cross-Page AI Copilot, Persistent Memory, STT & CUA Actions."""
import json
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from backend.app.models import get_db, ChatMessageModel
from backend.app.schemas.schemas import ChatMessageRequestSchema, ChatMemoryUpdateSchema
from backend.app.engine.groq_rotator import GROQ_ROTATOR
from backend.app.engine.copilot import (
    get_or_create_memory_profile,
    get_session_payload,
    process_chat_turn,
    serialize_memory_profile,
    _add_unique_memory,
    _now_iso,
    _safe_json_loads,
)

router = APIRouter(prefix="/api/chat", tags=["Copilot & Computer-Use Agent"])


@router.get("/session")
def get_chat_session(
    session_id: str = "default",
    active_tab: str = "workbench",
    active_asset_id: str = "",
    actor_name: str = "Nandha K",
    actor_role: str = "Creator",
    detail_mode: str = "simple",
    db: Session = Depends(get_db),
):
    """Loads persisted messages, memory profile, and live cross-page workflow connectivity."""
    return get_session_payload(
        db=db,
        session_id=session_id,
        client_context={
            "active_tab": active_tab,
            "active_asset_id": active_asset_id,
            "actor_name": actor_name,
            "actor_role": actor_role,
            "detail_mode": detail_mode,
        },
    )


@router.post("/message")
def post_chat_message(
    req: ChatMessageRequestSchema,
    db: Session = Depends(get_db),
):
    """Processes a Copilot turn with memory extraction, reasoning steps, and optional CUA action plans."""
    user_msg = (req.message or "").strip()
    if not user_msg:
        if req.image_data_url:
            user_msg = "Please analyze and audit this uploaded image for brand compliance, WCAG contrast, CIEDE2000 color fidelity, and regulatory safety."
        else:
            raise HTTPException(status_code=400, detail="Chat message cannot be empty.")
    return process_chat_turn(
        db=db,
        session_id=req.session_id,
        user_message=user_msg,
        allow_actions=req.allow_actions,
        client_context=req.client_context.model_dump(),
        model_preference=req.model_preference,
        reasoning_effort=req.reasoning_effort,
        image_data_url=req.image_data_url,
    )


@router.post("/transcribe")
async def transcribe_voice_prompt(file: UploadFile = File(...)):
    """Transcribes voice recording via whisper-large-v3-turbo rotating across all 25 Groq keys."""
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Audio recording is empty.")
    res = GROQ_ROTATOR.transcribe_audio(
        audio_bytes=audio_bytes,
        filename=file.filename or "voice.webm",
        mime_type=file.content_type or "audio/webm",
    )
    if not res.get("ok"):
        raise HTTPException(status_code=502, detail=res.get("error") or "Groq Whisper transcription failed.")
    return res


@router.post("/memory")
def update_chat_memory(
    req: ChatMemoryUpdateSchema,
    db: Session = Depends(get_db),
):
    """Updates Auto-Act preference or explicitly manages remembered session facts."""
    profile = get_or_create_memory_profile(db, session_id=req.session_id)
    facts = _safe_json_loads(profile.remembered_facts_json, [])
    if req.clear_all_memories:
        facts = []
    if req.forget_fact:
        target = req.forget_fact.strip().lower()
        facts = [f for f in facts if f.lower() != target]
    if req.add_fact:
        facts = _add_unique_memory(facts, req.add_fact)
    if req.auto_execute_cua is not None:
        profile.auto_execute_cua = bool(req.auto_execute_cua)

    profile.remembered_facts_json = json.dumps(facts, ensure_ascii=False)
    profile.updated_at = _now_iso()
    db.commit()

    msg_count = (
        db.query(ChatMessageModel)
        .filter(ChatMessageModel.session_id == profile.session_id)
        .count()
    )
    return {"memory_profile": serialize_memory_profile(profile, msg_count)}


@router.delete("/session")
def clear_chat_session(
    session_id: str = "default",
    keep_memory: bool = True,
    db: Session = Depends(get_db),
):
    """Clears chat history cleanly while optionally retaining user preferences & facts in memory."""
    sid = (session_id or "default").strip() or "default"
    db.query(ChatMessageModel).filter(ChatMessageModel.session_id == sid).delete()
    profile = get_or_create_memory_profile(db, session_id=sid)
    if not keep_memory:
        profile.remembered_facts_json = "[]"
        profile.last_asset_id = ""
        profile.updated_at = _now_iso()
    db.commit()
    return {"status": "cleared", "memory_profile": serialize_memory_profile(profile, 0)}
