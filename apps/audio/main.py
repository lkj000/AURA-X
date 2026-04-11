from fastapi import FastAPI
from routers import generate, stems, upload, log_drum, mix, master, render, analysis, dj

app = FastAPI(title="AURA X Audio Service", version="0.1.0")

app.include_router(generate.router)
app.include_router(stems.router)
app.include_router(upload.router)
app.include_router(log_drum.router)
app.include_router(mix.router)
app.include_router(master.router)
app.include_router(render.router)
app.include_router(analysis.router)
app.include_router(dj.router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "aura-x-audio", "version": "0.1.0"}
