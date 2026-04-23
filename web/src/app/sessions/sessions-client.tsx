"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FolderOpen,
  LoaderCircle,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  deleteAccountSession,
  fetchAccountSessions,
  fetchAccounts,
  type Account,
  type RemoteSession,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type SessionsClientProps = {
  initialAccountId: string;
};

function maskToken(token?: string) {
  if (!token) {
    return "—";
  }
  if (token.length <= 18) {
    return token;
  }
  return `${token.slice(0, 16)}...${token.slice(-8)}`;
}

function formatSessionTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function normalizeAccounts(items: Account[]) {
  return items;
}

export function SessionsClient({ initialAccountId }: SessionsClientProps) {
  const router = useRouter();
  const didLoadRef = useRef(false);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState(initialAccountId);
  const [sessions, setSessions] = useState<RemoteSession[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);
  const [total, setTotal] = useState(0);
  const [isAccountsLoading, setIsAccountsLoading] = useState(true);
  const [isSessionsLoading, setIsSessionsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deletingSession, setDeletingSession] = useState<RemoteSession | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [showBatchDeleteDialog, setShowBatchDeleteDialog] = useState(false);

  const currentAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId],
  );

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const offset = (page - 1) * pageSize;

  const loadAccounts = async () => {
    setIsAccountsLoading(true);
    try {
      const data = await fetchAccounts();
      const nextAccounts = normalizeAccounts(data.items);
      setAccounts(nextAccounts);
    } catch (error) {
      const message = error instanceof Error ? error.message : "加载账号失败";
      toast.error(message);
    } finally {
      setIsAccountsLoading(false);
    }
  };

  const loadSessions = async (accountId: string, currentOffset: number, silent = false) => {
    if (!accountId) {
      setSessions([]);
      setTotal(0);
      setIsSessionsLoading(false);
      return;
    }

    if (!silent) {
      setIsSessionsLoading(true);
    }
    try {
      const data = await fetchAccountSessions(accountId, { offset: currentOffset, limit: pageSize });
      setSessions(data.items);
      setTotal(data.total);
    } catch (error) {
      const message = error instanceof Error ? error.message : "加载会话失败";
      toast.error(message);
      setSessions([]);
      setTotal(0);
    } finally {
      if (!silent) {
        setIsSessionsLoading(false);
      }
    }
  };

  useEffect(() => {
    if (didLoadRef.current) {
      return;
    }
    didLoadRef.current = true;
    void loadAccounts();
  }, []);

  useEffect(() => {
    const resolvedFromQuery = String(initialAccountId || "").trim();
    const resolvedAccountId = accounts.some((account) => account.id === resolvedFromQuery)
      ? resolvedFromQuery
      : accounts[0]?.id ?? "";

    if (!resolvedAccountId) {
      return;
    }

    if (selectedAccountId !== resolvedAccountId) {
      setSelectedAccountId(resolvedAccountId);
      setPage(1);
    }

    if (resolvedFromQuery !== resolvedAccountId) {
      router.replace(`/sessions?accountId=${resolvedAccountId}`);
    }
  }, [accounts, initialAccountId, router]);

  useEffect(() => {
    setSelectedSessionIds(new Set());
  }, [selectedAccountId]);

  useEffect(() => {
    if (!selectedAccountId) {
      return;
    }
    void loadSessions(selectedAccountId, offset);
  }, [offset, pageSize, selectedAccountId]);

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  const handleSelectAccount = (accountId: string) => {
    setSelectedAccountId(accountId);
    setPage(1);
    router.replace(`/sessions?accountId=${accountId}`);
  };

  const handleRefresh = async () => {
    if (!selectedAccountId) {
      return;
    }
    setIsRefreshing(true);
    try {
      await loadSessions(selectedAccountId, offset, true);
      toast.success("会话列表已刷新");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSelectSession = (sessionId: string) => {
    const newSelected = new Set(selectedSessionIds);
    if (newSelected.has(sessionId)) {
      newSelected.delete(sessionId);
    } else {
      newSelected.add(sessionId);
    }
    setSelectedSessionIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedSessionIds.size === sessions.length) {
      setSelectedSessionIds(new Set());
    } else {
      setSelectedSessionIds(new Set(sessions.map((s) => s.id)));
    }
  };

  const handleBatchDelete = async () => {
    if (!selectedAccountId || selectedSessionIds.size === 0) {
      return;
    }

    setIsBulkDeleting(true);
    try {
      const toDelete = Array.from(selectedSessionIds);
      const results = await Promise.allSettled(
        toDelete.map((sessionId) => deleteAccountSession(selectedAccountId, sessionId)),
      );

      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;

      const nextSessions = sessions.filter((s) => !selectedSessionIds.has(s.id));
      setSessions(nextSessions);
      setTotal((prev) => Math.max(0, prev - succeeded));
      setSelectedSessionIds(new Set());

      if (nextSessions.length === 0 && page > 1) {
        setPage((prev) => Math.max(1, prev - 1));
      }

      if (failed === 0) {
        toast.success(`已删除 ${succeeded} 个会话`);
      } else {
        toast.warning(`已删除 ${succeeded} 个会话，${failed} 个失败`);
      }

      setShowBatchDeleteDialog(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "批量删除失败";
      toast.error(message);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleDeleteSession = async () => {
    if (!selectedAccountId || !deletingSession) {
      return;
    }

    setIsDeleting(true);
    try {
      const nextSessions = sessions.filter((item) => item.id !== deletingSession.id);
      await deleteAccountSession(selectedAccountId, deletingSession.id);
      setTotal((prev) => Math.max(0, prev - 1));

      if (nextSessions.length === 0 && page > 1) {
        setPage((prev) => Math.max(1, prev - 1));
      } else {
        setSessions(nextSessions);
      }

      toast.success("会话已删除");
      setDeletingSession(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "删除会话失败";
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  };

  const paginationItems = useMemo(() => {
    const items: (number | "...")[] = [];
    const start = Math.max(1, page - 1);
    const end = Math.min(pageCount, page + 1);

    if (start > 1) items.push(1);
    if (start > 2) items.push("...");
    for (let current = start; current <= end; current += 1) items.push(current);
    if (end < pageCount - 1) items.push("...");
    if (end < pageCount) items.push(pageCount);

    return items;
  }, [page, pageCount]);

  const formatAccountLabel = (account: Account) => {
    const email = account.email ?? "未绑定邮箱";
    return `${email} · ${maskToken(account.access_token)}`;
  };

  return (
    <>
      <section className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="text-xs font-semibold tracking-[0.18em] text-stone-500 uppercase">Session Manager</div>
          <h1 className="text-2xl font-semibold tracking-tight">会话管理</h1>
          <p className="text-sm text-stone-500">查看并删除单个账号的远程会话。</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" className="h-10 rounded-xl border-stone-200 bg-white/80 px-4 text-stone-700 hover:bg-white">
            <Link href="/accounts">
              <ArrowLeft className="size-4" />
              返回号池管理
            </Link>
          </Button>
          <Button
            variant="outline"
            className="h-10 rounded-xl border-stone-200 bg-white/80 px-4 text-stone-700 hover:bg-white"
            onClick={() => void loadAccounts()}
            disabled={isAccountsLoading || isSessionsLoading || isRefreshing || isDeleting}
          >
            <RefreshCw className={cn("size-4", isAccountsLoading ? "animate-spin" : "")} />
            刷新账号
          </Button>
        </div>
      </section>

      <section className="space-y-4">
        <Card className="rounded-2xl border-white/80 bg-white/90 shadow-sm">
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-1">
                <div className="text-sm font-medium text-stone-700">当前账号</div>
                <div className="text-sm text-stone-500">
                  {currentAccount ? formatAccountLabel(currentAccount) : "正在选择账号"}
                </div>
              </div>

              <div className="flex flex-col gap-2 lg:w-[420px]">
                <div className="text-sm font-medium text-stone-700">选择账号</div>
                <Select
                  value={selectedAccountId}
                  onValueChange={(value) => handleSelectAccount(value)}
                  disabled={isAccountsLoading || accounts.length === 0}
                >
                  <SelectTrigger className="h-11 rounded-xl border-stone-200 bg-white">
                    <SelectValue placeholder="请选择账号" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {formatAccountLabel(account)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl bg-stone-50 px-4 py-3">
                <div className="text-xs font-medium text-stone-400 uppercase">会话总数</div>
                <div className="mt-1 text-2xl font-semibold text-stone-900">{total}</div>
              </div>
              <div className="rounded-2xl bg-stone-50 px-4 py-3">
                <div className="text-xs font-medium text-stone-400 uppercase">当前页</div>
                <div className="mt-1 text-2xl font-semibold text-stone-900">{page}</div>
              </div>
              <div className="rounded-2xl bg-stone-50 px-4 py-3">
                <div className="text-xs font-medium text-stone-400 uppercase">每页数量</div>
                <div className="mt-1 text-2xl font-semibold text-stone-900">{pageSize}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-2xl border-white/80 bg-white/90 shadow-sm">
          <CardContent className="space-y-0 p-0">
            <div className="flex flex-col gap-3 border-b border-stone-100 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2 text-sm text-stone-500">
                <CircleAlert className="size-4" />
                删除操作会直接同步到 ChatGPT 远程会话。
                {selectedSessionIds.size > 0 && (
                  <span className="ml-2 font-medium text-stone-700">已选中 {selectedSessionIds.size} 个</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {selectedSessionIds.size > 0 && (
                  <Button
                    variant="ghost"
                    className="h-8 rounded-lg px-3 text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                    onClick={() => setShowBatchDeleteDialog(true)}
                    disabled={isBulkDeleting}
                  >
                    {isBulkDeleting ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                    批量删除
                  </Button>
                )}
                <Button
                  variant="ghost"
                  className="h-8 rounded-lg px-3 text-stone-500 hover:bg-stone-100"
                  onClick={() => void handleRefresh()}
                  disabled={!selectedAccountId || isRefreshing || isSessionsLoading || isBulkDeleting}
                >
                  {isRefreshing ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                  刷新会话列表
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left">
                <thead className="border-b border-stone-100 text-[11px] tracking-[0.18em] text-stone-400 uppercase">
                  <tr>
                    <th className="w-[4%] px-4 py-3">
                      <Checkbox
                        checked={sessions.length > 0 && selectedSessionIds.size === sessions.length}
                        indeterminate={selectedSessionIds.size > 0 && selectedSessionIds.size < sessions.length}
                        onCheckedChange={() => handleSelectAll()}
                      />
                    </th>
                    <th className="w-[30%] px-4 py-3">标题</th>
                    <th className="w-[15%] px-4 py-3">创建时间</th>
                    <th className="w-[15%] px-4 py-3">更新时间</th>
                    <th className="w-[14%] px-4 py-3">状态</th>
                    <th className="w-[10%] px-4 py-3">会话类型</th>
                    <th className="w-[10%] px-4 py-3">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {isSessionsLoading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-14 text-center text-sm text-stone-500">
                        <div className="inline-flex items-center gap-2 rounded-xl bg-stone-100 px-4 py-2 text-stone-600">
                          <LoaderCircle className="size-4 animate-spin" />
                          正在加载会话列表
                        </div>
                      </td>
                    </tr>
                  ) : sessions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-16 text-center">
                        <div className="flex flex-col items-center gap-3 text-stone-500">
                          <div className="rounded-2xl bg-stone-100 p-4 text-stone-400">
                            <FolderOpen className="size-6" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-stone-700">没有会话</p>
                            <p className="text-sm text-stone-500">当前账号没有可管理的远程会话。</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    sessions.map((session) => {
                      const flags: string[] = [];
                      if (session.is_temporary_chat) flags.push("临时");
                      if (session.is_do_not_remember) flags.push("不记忆");
                      if (session.is_archived) flags.push("归档");
                      const isSelected = selectedSessionIds.has(session.id);

                      return (
                        <tr
                          key={session.id}
                          className={cn(
                            "border-b border-stone-100/80 text-sm text-stone-600 transition-colors",
                            isSelected ? "bg-stone-100/50" : "hover:bg-stone-50/70",
                          )}
                        >
                          <td className="px-4 py-4">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => handleSelectSession(session.id)}
                            />
                          </td>
                          <td className="px-4 py-4">
                            <div className="space-y-1">
                              <div className="font-medium tracking-tight text-stone-800">{session.title || "未命名会话"}</div>
                              <div className="text-xs text-stone-400">{session.id}</div>
                              {session.snippet ? <div className="line-clamp-2 text-xs text-stone-500">{session.snippet}</div> : null}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-xs text-stone-500">{formatSessionTime(session.create_time)}</td>
                          <td className="px-4 py-4 text-xs text-stone-500">{formatSessionTime(session.update_time)}</td>
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-2">
                              <Badge variant={session.is_archived ? "warning" : "success"} className="rounded-md px-2 py-1">
                                {session.is_archived ? "已归档" : "可见"}
                              </Badge>
                              {flags.map((flag) => (
                                <Badge key={flag} variant="secondary" className="rounded-md px-2 py-1">
                                  {flag}
                                </Badge>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <Badge variant="info" className="rounded-md px-2 py-1">
                              {session.is_temporary_chat ? "临时" : "常规"}
                            </Badge>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-1">
                              {selectedSessionIds.size === 0 && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-9 rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                                  onClick={() => setDeletingSession(session)}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="border-t border-stone-100 px-4 py-4">
              <div className="flex items-center justify-center gap-3 overflow-x-auto whitespace-nowrap">
                <div className="shrink-0 text-sm text-stone-500">
                  显示第 {total === 0 ? 0 : offset + 1} - {Math.min(offset + pageSize, total)} 条，共 {total} 条
                </div>
                <span className="shrink-0 text-sm leading-none text-stone-500">
                  {page} / {pageCount} 页
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-10 shrink-0 rounded-lg border-stone-200 bg-white"
                  disabled={page <= 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                {paginationItems.map((item, index) =>
                  item === "..." ? (
                    <span key={`ellipsis-${index}`} className="px-1 text-sm text-stone-400">
                      ...
                    </span>
                  ) : (
                    <Button
                      key={item}
                      variant={item === page ? "default" : "outline"}
                      className={cn(
                        "h-10 min-w-10 shrink-0 rounded-lg px-3",
                        item === page
                          ? "bg-stone-950 text-white hover:bg-stone-800"
                          : "border-stone-200 bg-white text-stone-700",
                      )}
                      onClick={() => setPage(item)}
                    >
                      {item}
                    </Button>
                  ),
                )}
                <Button
                  variant="outline"
                  size="icon"
                  className="size-10 shrink-0 rounded-lg border-stone-200 bg-white"
                  disabled={page >= pageCount}
                  onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <Dialog open={Boolean(deletingSession)} onOpenChange={(open) => (!open ? setDeletingSession(null) : null)}>
        <DialogContent showCloseButton={false} className="rounded-2xl p-6">
          <DialogHeader className="gap-2">
            <DialogTitle>删除会话</DialogTitle>
            <DialogDescription className="text-sm leading-6">
              确认删除这个远程会话后，将无法在 ChatGPT 中恢复。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-2xl bg-stone-50 px-4 py-3 text-sm text-stone-600">
            <div className="font-medium text-stone-800">{deletingSession?.title || "未命名会话"}</div>
            <div className="text-xs text-stone-400">{deletingSession?.id}</div>
          </div>
          <DialogFooter className="pt-2">
            <Button
              variant="secondary"
              className="h-10 rounded-xl bg-stone-100 px-5 text-stone-700 hover:bg-stone-200"
              onClick={() => setDeletingSession(null)}
              disabled={isDeleting}
            >
              取消
            </Button>
            <Button
              className="h-10 rounded-xl bg-rose-600 px-5 text-white hover:bg-rose-500"
              onClick={() => void handleDeleteSession()}
              disabled={isDeleting || deletingSession === null}
            >
              {isDeleting ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBatchDeleteDialog} onOpenChange={setShowBatchDeleteDialog}>
        <DialogContent showCloseButton={false} className="rounded-2xl p-6">
          <DialogHeader className="gap-2">
            <DialogTitle>批量删除会话</DialogTitle>
            <DialogDescription className="text-sm leading-6">
              确认删除后，这 {selectedSessionIds.size} 个远程会话将无法在 ChatGPT 中恢复。
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[300px] space-y-2 overflow-y-auto rounded-2xl bg-stone-50 px-4 py-3 text-sm text-stone-600">
            {sessions
              .filter((s) => selectedSessionIds.has(s.id))
              .map((session) => (
                <div key={session.id} className="border-b border-stone-200 pb-2 last:border-0">
                  <div className="font-medium text-stone-800">{session.title || "未命名会话"}</div>
                  <div className="text-xs text-stone-400">{session.id}</div>
                </div>
              ))}
          </div>
          <DialogFooter className="pt-2">
            <Button
              variant="secondary"
              className="h-10 rounded-xl bg-stone-100 px-5 text-stone-700 hover:bg-stone-200"
              onClick={() => setShowBatchDeleteDialog(false)}
              disabled={isBulkDeleting}
            >
              取消
            </Button>
            <Button
              className="h-10 rounded-xl bg-rose-600 px-5 text-white hover:bg-rose-500"
              onClick={() => void handleBatchDelete()}
              disabled={isBulkDeleting}
            >
              {isBulkDeleting ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              批量删除 ({selectedSessionIds.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
