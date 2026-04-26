from __future__ import annotations

from typing import Any

from curl_cffi.requests import Session


def _stringify_detail(detail: Any) -> str | None:
    if detail is None:
        return None
    text = detail if isinstance(detail, str) else repr(detail)
    normalized = " ".join(text.split())
    return normalized[:400] if normalized else None


def _delete_result(
    *,
    ok: bool,
    status: str,
    http_status: int | None = None,
    detail: Any = None,
) -> dict[str, object]:
    return {
        "ok": ok,
        "status": status,
        "http_status": http_status,
        "detail": _stringify_detail(detail),
    }


def _response_detail(response) -> Any:
    try:
        payload = response.json()
    except Exception:
        payload = None
    if isinstance(payload, dict):
        return payload.get("detail") or payload.get("error") or payload
    return response.text


def delete_remote_conversation(session: Session, access_token: str, device_id: str, conversation_id: str) -> dict[str, object]:
    normalized_id = str(conversation_id or "").strip()
    if not normalized_id:
        return _delete_result(ok=False, status="missing_conversation_id")
    try:
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
    except Exception as exc:
        return _delete_result(ok=False, status="exception", detail=f"{exc.__class__.__name__}: {exc}")
    if response.status_code == 404:
        detail = _response_detail(response)
        if isinstance(detail, dict) and detail.get("code") == "conversation_deleted":
            return _delete_result(ok=True, status="already_deleted", http_status=404, detail=detail.get("code"))
        return _delete_result(ok=False, status="http_error", http_status=404, detail=detail)
    if response.status_code != 200:
        return _delete_result(
            ok=False,
            status="http_error",
            http_status=response.status_code,
            detail=_response_detail(response),
        )
    try:
        payload = response.json()
    except Exception as exc:
        return _delete_result(ok=False, status="invalid_json", http_status=200, detail=f"{exc.__class__.__name__}: {response.text}")
    if isinstance(payload, dict) and payload.get("success"):
        return _delete_result(ok=True, status="deleted", http_status=200)
    detail = payload
    if isinstance(payload, dict):
        detail = payload.get("detail") or payload.get("error") or payload
    return _delete_result(ok=False, status="success_false", http_status=200, detail=detail)


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
    result = delete_remote_conversation(session, access_token, device_id, normalized_id)
    print(
        f"[{log_prefix}] auto-delete conversation={normalized_id} "
        f"ok={result['ok']} status={result['status']} "
        f"http_status={result['http_status']} detail={result['detail']}"
    )
