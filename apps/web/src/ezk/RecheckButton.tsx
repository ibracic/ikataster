import { useState } from "react";
import { Alert, Button, Loader, Text, Tooltip } from "@mantine/core";
import { IconRefreshAlert } from "@tabler/icons-react";
import type { BridgeErrorCode } from "@ikataster/bridge";
import { useI18n } from "../i18n";
import { useQueue } from "../queue/instance";
import type { CartInput } from "../cart/store";
import { ezkErrorMessage, fmt } from "./QuotaBadge";
import type { ResultRecord } from "./results";
import { useResults } from "./useResults";

/** Queue items for downloading the extracts of these results again (properties only). */
export function recheckItems(records: ResultRecord[]): CartInput[] {
  const out: CartInput[] = [];
  for (const r of records) {
    const p = r.extract.property;
    if ((p.type !== "parcel" && p.type !== "building" && p.type !== "part") || p.koId == null || !p.number) continue;
    out.push({ kind: p.type, koId: p.koId, koName: p.koName ?? "", number: p.number, ...(p.type === "part" && p.part != null ? { part: p.part } : {}), eid: "", geometry: null });
  }
  return out;
}

/** "Preveri spremembe": download all listed extracts again via the extension; the results store records the differences. */
export function RecheckButton({ records }: { records: ResultRecord[] }) {
  const { t } = useI18n();
  const { store, runner } = useQueue();
  const { store: results } = useResults();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ color: string; text: string } | null>(null);
  const items = recheckItems(records);
  const run = async () => {
    setBusy(true); setMsg(null);
    try {
      const startedAt = Date.now();
      await store.enqueue(items, { again: true });
      const rep = await runner.run();
      const fresh = (await results.list()).filter((r) => (r.changes?.checkedAt ?? 0) >= startedAt);
      const changed = fresh.filter((r) => r.changes!.items.length > 0).length;
      const failedCode = rep.done ? undefined : (await store.list()).find((j) => j.status === "failed" || j.status === "deferred")?.code;
      const text = fmt(t("chgReport"), { n: fresh.length, c: changed });
      setMsg(failedCode ? { color: "orange", text: ezkErrorMessage(failedCode as BridgeErrorCode, t as never) ?? text }
        : { color: changed ? "orange" : "teal", text });
    } finally { setBusy(false); }
  };
  return (
    <>
      <Tooltip label={t("chgCheckHint")} multiline w={280} withArrow>
        <Button size="xs" variant="light" color="orange" data-testid="recheck" disabled={busy || !items.length}
          leftSection={busy ? <Loader size={12} /> : <IconRefreshAlert size={14} />} onClick={() => void run()}>
          {busy ? t("chgChecking") : `${t("chgCheck")} (${items.length})`}
        </Button>
      </Tooltip>
      {msg && <Alert color={msg.color} p="xs" withCloseButton onClose={() => setMsg(null)} data-testid="recheck-report" w="100%"><Text size="sm">{msg.text}</Text></Alert>}
    </>
  );
}
