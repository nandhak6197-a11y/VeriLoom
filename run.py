# -*- coding: utf-8 -*-
"""Single-command launcher for VeriLoom Round 2 MVP."""
import uvicorn

if __name__ == "__main__":
    print("=================================================================")
    print("  VeriLoom: Guidelines as an Executable Specification (Round 2)  ")
    print("  Reviewer Workbench UI : http://localhost:8000                  ")
    print("  OpenAPI Swagger Docs  : http://localhost:8000/docs             ")
    print("=================================================================")
    uvicorn.run("backend.app.main:app", host="127.0.0.1", port=8000, reload=False)
