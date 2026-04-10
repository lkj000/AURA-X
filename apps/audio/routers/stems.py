from fastapi import APIRouter

router = APIRouter(prefix="/stems", tags=["stems"])


@router.post("/separate")
def separate():
    """Stem separation via Demucs — Phase 04 Job 29"""
    return {"status": "not_implemented", "message": "Stem separation — Job 29"}
