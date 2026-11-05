"""
nirvul360 Python Backend Runner
Runs FastAPI with Uvicorn on port 8000
"""
import sys
import os
from pathlib import Path
import uvicorn
from dotenv import load_dotenv

# Auto-load .env from root project directory
root_dir = Path(__file__).resolve().parent
env_path = root_dir / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path, override=True)
else:
    load_dotenv(override=True)

# Ensure backend is in pythonpath
backend_dir = root_dir / "backend"
sys.path.insert(0, str(backend_dir))

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    print(f"Starting nirvul360 Python Backend on http://localhost:{port}")
    uvicorn.run("app.main:app", host="127.0.0.1", port=port, reload=False, app_dir=str(backend_dir))
