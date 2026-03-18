from __future__ import annotations

import os
from pathlib import Path


def resolve_secret(name: str, default: str = "", mode: str = "env") -> str:
    direct = os.getenv(name)
    if direct:
        return direct

    file_binding = os.getenv(f"{name}_FILE")
    if file_binding:
        path = Path(file_binding)
        if path.exists() and path.is_file():
            return path.read_text(encoding="utf-8").strip()

    # Env binding lets operators map secret names to existing env vars.
    # Example:
    # OPENAI_API_KEY_SECRET_NAME=PROD_OPENAI_KEY
    # PROD_OPENAI_KEY=sk-...
    secret_env_name = os.getenv(f"{name}_SECRET_NAME")
    if secret_env_name:
        bound_value = os.getenv(secret_env_name)
        if bound_value:
            return bound_value

    # Placeholder for external secret managers in future deployments.
    if mode not in {"env", "docker_file"}:
        return default

    return default
