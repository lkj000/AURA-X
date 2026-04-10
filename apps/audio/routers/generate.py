from fastapi import APIRouter

router = APIRouter(prefix="/generate", tags=["generate"])


@router.post("")
def generate():
    """Mode 1/2/3 generation — Phase 03"""
    return {"status": "not_implemented", "message": "Generation pipeline — Phase 03"}
