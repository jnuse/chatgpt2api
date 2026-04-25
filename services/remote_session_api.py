from __future__ import annotations

from collections.abc import Callable

from fastapi import APIRouter, Header, HTTPException

from services.account_service import AccountService
from services.chatgpt_service import ChatGPTService


def resolve_account_access_token(account_service: AccountService, account_id: str) -> str:
    normalized_account_id = str(account_id or "").strip()
    if not normalized_account_id:
        raise HTTPException(status_code=400, detail={"error": "account_id is required"})

    for account in account_service.list_accounts():
        if str(account.get("id") or "").strip() != normalized_account_id:
            continue
        access_token = str(account.get("access_token") or "").strip()
        if access_token:
            return access_token

    raise HTTPException(status_code=404, detail={"error": "account not found"})


def register_remote_session_routes(
    router: APIRouter,
    *,
    require_auth_key: Callable[[str | None], None],
    account_service: AccountService,
    chatgpt_service: ChatGPTService,
) -> None:
    @router.get("/api/accounts/{account_id}/sessions")
    async def list_account_sessions(
        account_id: str,
        authorization: str | None = Header(default=None),
        offset: int = 0,
        limit: int = 28,
    ):
        require_auth_key(authorization)
        if offset < 0:
            raise HTTPException(status_code=400, detail={"error": "offset must be greater than or equal to 0"})
        if limit < 1 or limit > 100:
            raise HTTPException(status_code=400, detail={"error": "limit must be between 1 and 100"})

        access_token = resolve_account_access_token(account_service, account_id)
        try:
            return chatgpt_service.list_conversations(access_token, offset=offset, limit=limit)
        except HTTPException as exc:
            if exc.status_code == 401:
                account_service.update_account(access_token, {"status": "异常", "quota": 0})
            raise

    @router.delete("/api/accounts/{account_id}/sessions/{session_id}")
    async def delete_account_session(
        account_id: str,
        session_id: str,
        authorization: str | None = Header(default=None),
    ):
        require_auth_key(authorization)
        access_token = resolve_account_access_token(account_service, account_id)
        try:
            return chatgpt_service.delete_conversation(access_token, session_id)
        except HTTPException as exc:
            if exc.status_code == 401:
                account_service.update_account(access_token, {"status": "异常", "quota": 0})
            raise
