from __future__ import annotations

from curl_cffi.requests import Session


def delete_remote_conversation(session: Session, access_token: str, device_id: str, conversation_id: str) -> bool:
    normalized_id = str(conversation_id or "").strip()
    if not normalized_id:
        return False
    response = session.patch(
        f"https://chatgpt.com/backend-api/conversation/{normalized_id}",
        json={"is_visible": False},
        headers={
            "Authorization": f"Bearer {access_token}",
            "oai-device-id": device_id,
            "x-openai-target-path": f"/backend-api/conversation/{normalized_id}",
            "x-openai-target-route": f"/backend-api/conversation/{normalized_id}",
        },
        timeout=20,
    )
    if response.status_code == 404:
        try:
            payload = response.json()
        except Exception:
            payload = None
        detail = payload.get("detail") if isinstance(payload, dict) else None
        if isinstance(detail, dict) and detail.get("code") == "conversation_deleted":
            return True
    if response.status_code != 200:
        return False
    try:
        payload = response.json()
    except Exception:
        payload = None
    return bool(payload.get("success")) if isinstance(payload, dict) else False


def cleanup_remote_session(
    session: Session,
    access_token: str,
    device_id: str,
    conversation_id: str,
    *,
    enabled: bool,
    log_prefix: str,
) -> None:
    normalized_id = str(conversation_id or "").strip()
    if not enabled or not normalized_id:
        return
    try:
        deleted = delete_remote_conversation(session, access_token, device_id, normalized_id)
        print(f"[{log_prefix}] auto-delete conversation={normalized_id} success={deleted}")
    except Exception as exc:
        print(f"[{log_prefix}] auto-delete fail conversation={normalized_id} error={exc}")
