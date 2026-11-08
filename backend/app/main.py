# -*- coding: utf-8 -*-
"""FastAPI Application Entrypoint for VeriLoom Round 2 MVP."""
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from backend.app.config import FRONTEND_DIR
from backend.app.models import Base, engine, SessionLocal, get_db, verify_audit_chain
from backend.app.seed import seed_initial_data, get_rules_as_dicts, get_facts_as_dicts
from backend.app.api import guidelines, facts, submissions, workflow, insights


def init_db_and_seed() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_initial_data(db)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db_and_seed()
    yield


app = FastAPI(
    title="VeriLoom: Guidelines as an Executable Specification",
    description="9-Layer Enterprise Brand Governance, Time-Bounded Fact Verification & Surgical Diff Workbench (Round 2 MVP)",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(guidelines.router)
app.include_router(facts.router)
app.include_router(submissions.router)
app.include_router(workflow.router)
app.include_router(insights.router)


@app.get("/api/health")
def health_check(db: Session = Depends(get_db)):
    rules = get_rules_as_dicts(db)
    facts_list = get_facts_as_dicts(db)
    chain = verify_audit_chain(db)
    return {
        "status": "healthy",
        "service": "VeriLoom Round 2 MVP",
        "version": "2.0.0",
        "active_rules_count": len(rules),
        "facts_count": len(facts_list),
        "audit_chain_valid": chain["valid"],
        "audit_events_count": chain["total_events"],
    }


@app.middleware("http")
async def disable_static_cache(request, call_next):
    response = await call_next(request)
    if request.url.path == "/" or request.url.path.startswith("/static"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    return response


if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.get("/")
def serve_workbench():
    index_file = FRONTEND_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return JSONResponse({"message": "VeriLoom API is running. Visit /docs for OpenAPI documentation."})
