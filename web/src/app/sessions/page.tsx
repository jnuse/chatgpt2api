import { SessionsClient } from "./sessions-client";

export default function SessionsPage({
  searchParams,
}: {
  searchParams?: { accountId?: string | string[] };
}) {
  const rawAccountId = searchParams?.accountId;
  const initialAccountId = Array.isArray(rawAccountId)
    ? rawAccountId[0] ?? ""
    : String(rawAccountId ?? "").trim();

  return <SessionsClient initialAccountId={initialAccountId} />;
}
