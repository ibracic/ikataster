import { useEffect, useState } from "react";
import { Alert, Badge, Button, Group, Progress, Stack, Text } from "@mantine/core";
import { IconDownload, IconPlayerPause, IconPlayerPlay, IconRefresh, IconX } from "@tabler/icons-react";
import { useLiveQuery } from "dexie-react-hooks";
import type { BridgeErrorCode } from "@ikataster/bridge";
import { useI18n } from "../i18n";
import { useCart } from "../cart/useCart";
import { ezkErrorMessage, fmt, QuotaBadge } from "../ezk/QuotaBadge";
import { useQueue } from "./instance";
import type { Job, JobStatus } from "./store";
import type { RunReport } from "./runner";

const COLOR: Record<JobStatus, string> = { queued: "gray", running: "blue", done: "teal", failed: "red", deferred: "orange" };
const label = (j: Job) => j.item.kind === "part" ? `${j.item.koId} ${j.item.number}/${j.item.part}` : `${j.item.koId} ${j.item.number}`;

/** Bulk eZK download of the cart: one click, per-item state, pause/resume/cancel, retry failed, resume after reload. */
export function QueuePanel() {
  const { t } = useI18n();
  const { items } = useCart();
  const { store, runner, quota } = useQueue();
  const jobs = useLiveQuery(() => store.list(), [store]) ?? [];
  const [running, setRunning] = useState(runner.running);
  const [report, setReport] = useState<RunReport | null>(null);
  useEffect(() => runner.onChange(setRunning), [runner]);

  const count = (s: JobStatus) => jobs.filter((j) => j.status === s).length;
  const done = count("done"), failed = count("failed"), waiting = count("queued") + count("deferred") + count("running");
  const start = async (enqueue: boolean) => {
    setReport(null);
    if (enqueue) await store.enqueue(items);
    setReport(await runner.run());
  };
  const err = (c?: string) => (c ? ezkErrorMessage(c as BridgeErrorCode, t as never) ?? c : null);
  const interrupted = !running && !report && waiting > 0;

  return (
    <Stack gap={6} data-testid="queue" data-running={running ? "yes" : "no"}>
      <QuotaBadge quota={quota} pending={Math.max(waiting, running ? 0 : items.length - done)} version={done} />
      {interrupted && (
        <Alert color="blue" variant="light" p="xs" data-testid="queue-resume">
          <Text size="sm">{fmt(t("queueInterrupted"), { n: waiting })}</Text>
          <Group gap={6} mt={6}>
            <Button size="compact-sm" leftSection={<IconPlayerPlay size={14} />} onClick={() => void start(false)}>{t("queueResume")}</Button>
            <Button size="compact-sm" variant="subtle" color="gray" onClick={() => void runner.cancel()}>{t("queueCancel")}</Button>
          </Group>
        </Alert>
      )}
      <Group gap={6}>
        {!running ? (
          <Button size="sm" leftSection={<IconDownload size={16} />} disabled={items.length === 0} onClick={() => void start(true)}>
            {fmt(t("queueDownloadAll"), { n: items.length })}
          </Button>
        ) : (
          <>
            <Button size="sm" variant="light" leftSection={<IconPlayerPause size={16} />} onClick={() => runner.pause()}>{t("queuePause")}</Button>
            <Button size="sm" variant="subtle" color="gray" leftSection={<IconX size={16} />} onClick={() => void runner.cancel()}>{t("queueCancel")}</Button>
          </>
        )}
        {!running && failed > 0 && (
          <Button size="sm" variant="light" color="orange" leftSection={<IconRefresh size={16} />}
            onClick={async () => { await store.retryFailed(); await start(false); }}>{fmt(t("queueRetry"), { n: failed })}</Button>
        )}
      </Group>
      {jobs.length > 0 && (
        <>
          <Progress size="sm" value={(done / jobs.length) * 100} animated={running} aria-label={t("queueProgress")} />
          <Text size="xs" c="dimmed" data-testid="queue-summary">{fmt(t("queueSummary"), { done, total: jobs.length, failed, waiting })}</Text>
        </>
      )}
      {report && report.reason !== "done" && (
        <Alert color={report.reason === "paused" ? "gray" : "orange"} variant="light" p="xs" data-testid="queue-stop">
          <Text size="xs">{report.reason === "paused" ? t("queuePaused") : report.reason === "quota" ? t("quotaExhausted") : err(report.code) ?? t("queueStopped")}</Text>
        </Alert>
      )}
      {jobs.length > 0 && (
        <Stack gap={2} data-testid="queue-jobs">
          {jobs.map((j) => (
            <Group key={j.key} justify="space-between" wrap="nowrap" gap={6} data-status={j.status}>
              <Text size="xs" truncate>{label(j)}</Text>
              <Badge size="xs" color={COLOR[j.status]} variant={j.status === "running" ? "filled" : "light"} title={err(j.code) ?? undefined}>
                {t(`queue_${j.status}` as never)}{j.status === "failed" && j.code ? ` · ${j.code === "NOT_IN_ZK" ? t("queueNotInZk") : j.code}` : ""}
              </Badge>
            </Group>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
