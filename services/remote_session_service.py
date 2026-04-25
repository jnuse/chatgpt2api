from __future__ import annotations

from curl_cffi.requests import Session
from fastapi import HTTPException

from services.account_service import AccountService
from services.proxy_service import proxy_settings
from services.utils import anonymize_token


def extract_remote_error_message(response) -> str:
    try:
        payload = response.json()
    except Exception:
        payload = None

    if isinstance(payload, dict):
        detail = payload.get("detail")
        if isinstance(detail, dict):
            message = str(detail.get("message") or detail.get("error") or detail.get("code") or "").strip()
            code = str(detail.get("code") or "").strip()
            if message and code and code not in message:
                return f"{message} ({code})"
            if message:
                return message
            if code:
                return code
        message = str(payload.get("error") or payload.get("message") or "").strip()
        if message:
            return message
    return f"HTTP {getattr(response, 'status_code', 500)}"


def build_remote_session(account_service: AccountService, access_token: str) -> tuple[Session, str]:
    headers, impersonate = account_service.build_remote_headers(access_token)
    token_ref = anonymize_token(access_token)
    session = Session(**proxy_settings.build_session_kwargs(impersonate=impersonate, verify=True))
    session.headers.update(headers)
    return session, token_ref


def list_remote_conversations(
    account_service: AccountService,
    access_token: str,
    *,
    offset: int = 0,
    limit: int = 28,
    order: str = "updated",
) -> dict[str, object]:
    session, token_ref = build_remote_session(account_service, access_token)
    print(f"[session-list] start token={token_ref} offset={offset} limit={limit} order={order}")
    try:
        response = session.get(
            "https://chatgpt.com/backend-api/conversations",
            params={
                "offset": offset,
                "limit": limit,
                "order": order,
                "is_archived": "false",
                "is_starred": "false",
            },
            headers={
                "x-openai-target-path": "/backend-api/conversations",
                "x-openai-target-route": "/backend-api/conversations",
            },
            timeout=20,
        )
        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail={"error": extract_remote_error_message(response)},
            )

        payload = response.json()
        if not isinstance(payload, dict):
            raise HTTPException(status_code=502, detail={"error": "invalid conversations response"})

        items = payload.get("items")
        if not isinstance(items, list):
            items = []

        total = payload.get("total")
        try:
            total_value = int(total)
        except (TypeError, ValueError):
            total_value = len(items)

        print(f"[session-list] ok token={token_ref} items={len(items)} total={total_value}")
        return {
            "items": [item for item in items if isinstance(item, dict)],
            "total": total_value,
            "limit": limit,
            "offset": offset,
        }
    finally:
        session.close()


def delete_remote_conversation(account_service: AccountService, access_token: str, conversation_id: str) -> dict[str, object]:
    session, token_ref = build_remote_session(account_service, access_token)
    print(f"[session-delete] start token={token_ref} conversation={conversation_id}")
    try:
        response = session.patch(
            f"https://chatgpt.com/backend-api/conversation/{conversation_id}",
            json={"is_visible": False},
            headers={
                "x-openai-target-path": f"/backend-api/conversation/{conversation_id}",
                "x-openai-target-route": "/backend-api/conversation/{conversation_id}",
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
                print(f"[session-delete] already deleted token={token_ref} conversation={conversation_id}")
                return {"success": True, "message": "Conversation has been deleted"}

        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail={"error": extract_remote_error_message(response)},
            )

        payload = response.json()
        success = bool(payload.get("success")) if isinstance(payload, dict) else False
        print(f"[session-delete] ok token={token_ref} conversation={conversation_id} success={success}")
        return {"success": success, "message": None}
    finally:
        session.close()
