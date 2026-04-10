from fastapi import FastAPI
from routers import generate, stems, upload, log_drum

app = FastAPI(title="AURA X Audio Service", version="0.1.0")

app.include_router(generate.router)
app.include_router(stems.router)
app.include_router(upload.router)
app.include_router(log_drum.router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "aura-x-audio", "version": "0.1.0"}
