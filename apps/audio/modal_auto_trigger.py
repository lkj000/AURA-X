"""
AURA X — Automatic Finetune Trigger
modal deploy apps/audio/modal_auto_trigger.py

Runs hourly. Checks dataset stats via AURA X API.
When ready_for_training: true, spawns finetune_musicgen.
Guards against duplicate runs using Modal Dict.

Prerequisites (one-time setup):
  modal secret create aura-x-supabase \
    SUPABASE_URL=https://... \
    SUPABASE_SERVICE_ROLE_KEY=...
  modal secret create aura-x-api \
    AURA_X_API_URL=https://your-aura-x-api.up.railway.app \
    AURA_X_API_KEY=your-internal-api-key
"""

import modal
from datetime import datetime

# ─── APP ──────────────────────────────────────────────────────────────────────

app = modal.App("aura-x-auto-trigger")

trigger_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("httpx", "supabase")
)

# Shared state dict — tracks whether a finetune run is active.
# Keys: "active_run_id" (str | None), "last_triggered_at" (str | None)
trigger_state = modal.Dict.from_name("aura-x-trigger-state", create_if_missing=True)

supabase_secret = modal.Secret.from_name("aura-x-supabase")
api_secret = modal.Secret.from_name("aura-x-api")


# ─── HELPERS ──────────────────────────────────────────────────────────────────

def _get_dataset_stats(api_url: str, api_key: str) -> dict:
    """
    GET /api/agent/dataset/stats
    Returns: { total, ready_for_training, training_threshold, mean_score, ... }
    """
    import httpx
    resp = httpx.get(
        f"{api_url}/api/agent/dataset/stats",
        headers={"x-api-key": api_key},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def _trigger_finetune_api(api_url: str, api_key: str, run_id: str) -> dict:
    """
    POST /api/agent/finetune — queues the job via the existing API endpoint.
    """
    import httpx
    resp = httpx.post(
        f"{api_url}/api/agent/finetune",
        json={
            "subgenre": None,        # train on all subgenres
            "min_score": 0.65,       # AC-AMI signal gate threshold
            "training_steps": 1000,
            "learning_rate": 1e-4,
            "triggered_by": "auto_trigger",
            "run_id": run_id,
        },
        headers={"x-api-key": api_key},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def _is_run_active() -> bool:
    """Check Modal Dict for an active run that hasn't completed."""
    active_run_id = trigger_state.get("active_run_id")
    return active_run_id is not None


def _mark_run_started(run_id: str) -> None:
    trigger_state["active_run_id"] = run_id
    trigger_state["last_triggered_at"] = datetime.utcnow().isoformat()
    print(f"[trigger] Marked run started: {run_id}")


def _mark_run_complete() -> None:
    completed_id = trigger_state.get("active_run_id")
    trigger_state["active_run_id"] = None
    trigger_state["last_completed_run_id"] = completed_id
    trigger_state["last_completed_at"] = datetime.utcnow().isoformat()
    print(f"[trigger] Marked run complete: {completed_id}")


# ─── SCHEDULED POLLER ─────────────────────────────────────────────────────────

@app.function(
    image=trigger_image,
    secrets=[api_secret],
    schedule=modal.Period(hours=1),
    timeout=120,
)
def check_and_trigger():
    """
    Runs hourly. Checks ready_for_training flag. Spawns finetune if:
      1. ready_for_training: true (>= 100 training records)
      2. No run currently active
    """
    import os

    api_url = os.environ["AURA_X_API_URL"]
    api_key = os.environ["AURA_X_API_KEY"]

    print(f"[trigger] Checking dataset stats at {datetime.utcnow().isoformat()}")

    # 1. Get stats
    try:
        stats = _get_dataset_stats(api_url, api_key)
    except Exception as e:
        print(f"[trigger] ERROR fetching stats: {e}")
        return

    total = stats.get("total", 0)
    ready = stats.get("ready_for_training", False)
    threshold = stats.get("training_threshold", 100)
    mean_score = stats.get("mean_score", 0)

    print(f"[trigger] total={total} ready={ready} threshold={threshold} mean_score={mean_score:.3f}")

    if not ready:
        print(f"[trigger] Not ready — {total}/{threshold} training records. Skipping.")
        return

    # 2. Guard: no duplicate runs
    if _is_run_active():
        active_id = trigger_state.get("active_run_id")
        triggered_at = trigger_state.get("last_triggered_at", "unknown")
        print(f"[trigger] Run already active: {active_id} (started {triggered_at}). Skipping.")
        return

    # 3. Spawn finetune
    run_id = f"auto-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}"
    print(f"[trigger] Spawning finetune run: {run_id}")

    try:
        result = _trigger_finetune_api(api_url, api_key, run_id)
        status = result.get("status")

        if status == "queued":
            _mark_run_started(run_id)
            print(f"[trigger] SUCCESS — run {run_id} queued. Message: {result.get('message')}")
        else:
            print(f"[trigger] Finetune rejected: {result.get('message')}")

    except Exception as e:
        print(f"[trigger] ERROR triggering finetune: {e}")


# ─── MANUAL TRIGGER ───────────────────────────────────────────────────────────

@app.function(
    image=trigger_image,
    secrets=[api_secret],
    timeout=120,
)
def trigger_now(force: bool = False):
    """
    Manual override. Run with:
      modal run apps/audio/modal_auto_trigger.py::trigger_now
      modal run apps/audio/modal_auto_trigger.py::trigger_now --force  (skip guards)

    force=True bypasses the ready_for_training check — use when you know
    the dataset is ready and want to start immediately.
    """
    import os

    api_url = os.environ["AURA_X_API_URL"]
    api_key = os.environ["AURA_X_API_KEY"]

    if not force:
        try:
            stats = _get_dataset_stats(api_url, api_key)
            ready = stats.get("ready_for_training", False)
            total = stats.get("total", 0)
            if not ready:
                print(f"[trigger] Dataset not ready ({total} records). Use --force to override.")
                return
        except Exception as e:
            print(f"[trigger] ERROR fetching stats: {e}")
            return

    if _is_run_active() and not force:
        print(f"[trigger] Run already active: {trigger_state.get('active_run_id')}. Use --force to override.")
        return

    run_id = f"manual-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}"
    print(f"[trigger] Manual trigger — run_id: {run_id}")

    result = _trigger_finetune_api(api_url, api_key, run_id)
    print(f"[trigger] Result: {result}")

    if result.get("status") == "queued":
        _mark_run_started(run_id)


# ─── MARK COMPLETE (called by finetune job at end of training) ─────────────────

@app.function(
    image=trigger_image,
    timeout=30,
)
def mark_finetune_complete():
    """
    Call at the end of finetune_musicgen to clear the active run lock.
    Add to modal_finetune.py:
      from modal_auto_trigger import mark_finetune_complete
      mark_finetune_complete.remote()
    """
    _mark_run_complete()
    print("[trigger] Run lock cleared.")


# ─── STATUS CHECK ─────────────────────────────────────────────────────────────

@app.function(
    image=trigger_image,
    timeout=30,
)
def status():
    """
    Check current trigger state.
    modal run apps/audio/modal_auto_trigger.py::status
    """
    active = trigger_state.get("active_run_id")
    triggered_at = trigger_state.get("last_triggered_at")
    completed = trigger_state.get("last_completed_run_id")
    completed_at = trigger_state.get("last_completed_at")

    print("── AURA X Trigger State ──────────────────")
    print(f"  active_run_id:          {active or 'None'}")
    print(f"  last_triggered_at:      {triggered_at or 'Never'}")
    print(f"  last_completed_run_id:  {completed or 'None'}")
    print(f"  last_completed_at:      {completed_at or 'Never'}")
    print("──────────────────────────────────────────")
