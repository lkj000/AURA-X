import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

_url = os.environ.get("SUPABASE_URL", "")
_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not _url or not _key:
    raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")

supabase: Client = create_client(_url, _key)
