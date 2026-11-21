import { useEffect, useState } from "react";
import { Alert, Badge, Button, Group, Progress, Stack, Text } from "@mantine/core";
import { IconDownload, IconPlayerPause, IconPlayerPlay, IconX } from "@tabler/icons-react";
import type { BridgeErrorCode } from "@ikataster/bridge";
import { useI18n } from "../i18n";
import { ezkErrorMessage, fmt, QuotaBadge } from "../ezk/QuotaBadge";
import { useQueue } from "./instance";
import { useDownloadList } from "./useDownloadList";
import { MissingActions } from "./MissingActions";
import type { Job } from "./store";
import type { RunReport } from "./runner";

const label = (j: Job, t: (key: "buildingPart" | "building" | "parcel") => string) => `${j.item.koId} · ${j.item.kind === "part" ? `${t("buildingPart")} ${j.item.number}/${j.item.part}` : j.item.kind === "building" ? `${t("building")} ${j.item.number}` : `${t("parcel")} ${j.item.number}`}`;

/** New downloads, current-round progress, and explicitly retried past failures are distinct. */
export function QueuePanel() {
  const { t } = useI18n();
  const { pending, jobs, ready, ...cart } = useDownloadList();
  const { store, runner, quota } = useQueue();
  // Round + report live in the runner, so closing the dialog or switching tabs keeps the progress view.
  const [, tick] = useState(0);
  useEffect(() => runner.onChange(() => tick(n => n + 1)), [runner]);
  const running = runner.running, round = runner.round, report: RunReport | null = runner.report;
  // A new addition begins a fresh view; do not keep yesterday's progress above it.
  useEffect(() => {
    if (!running && round && pending.some(i => !round.includes(i.key))) runner.clearRound();
  }, [pending, running, round, runner]);
  const pendingKeys = new Set(pending.map(i => i.key));
  const current = jobs.filter(j => round ? round.includes(j.key) : pendingKeys.has(j.key));
  const done = current.filter(j => j.status === "done").length;
  const failed = current.filter(j => j.status === "failed").length;
  const waiting = current.filter(j => ["queued", "deferred", "running"].includes(j.status)).length;
  const failures = jobs.filter(j => j.status === "failed");
  const start = async () => {
    const keys = pending.map(i => i.key);
    if (!keys.length) return;
    await store.enqueue(pending);
    await runner.run(keys);
  };
  const retry = async (list: Job[]) => {
    await store.enqueue(list.map(j => j.item), { again: true });
    await runner.run(list.map(j => j.key));
  };
  const reasonOf = (j: Job) => j.code === "NOT_IN_ZK" ? t("queueMissingHint") : err(j.code) ?? t("queue_failed");
  const groups = [...failures.reduce((m, j) => { const r = reasonOf(j); m.set(r, [...(m.get(r) ?? []), j]); return m; }, new Map<string, Job[]>())];
  const remove = async (list: Job[]) => { const keys = list.map(j => j.key); await store.remove(keys); await cart.store.remove(keys); };
  const err = (c?: string) => c ? ezkErrorMessage(c as BridgeErrorCode, t as never) ?? c : null;
  return <Stack gap={6} data-testid="queue" data-running={running ? "yes" : "no"}>
    <QuotaBadge quota={quota} pending={pending.length} version={jobs.filter(j => j.status === "done").length} />
    {!running && !round && waiting > 0 && <Alert color="blue" p="xs" data-testid="queue-resume">
      <Text size="sm">{fmt(t("queueInterrupted"), { n: waiting })}</Text>
      <Button size="compact-sm" leftSection={<IconPlayerPlay size={14} />} onClick={() => void start()}>{t("queueResume")}</Button>
    </Alert>}
    <Group gap={6}>
      {!running ? <Button size="sm" leftSection={<IconDownload size={16} />} disabled={!ready || pending.length === 0} onClick={() => void start()}>
        {fmt(t("queueDownloadAll"), { n: pending.length })}
      </Button> : <>
        <Button size="sm" variant="light" leftSection={<IconPlayerPause size={16} />} onClick={() => runner.pause()}>{t("queuePause")}</Button>
        <Button size="sm" variant="subtle" color="gray" leftSection={<IconX size={16} />} onClick={() => void runner.cancel()}>{t("queueCancel")}</Button>
      </>}
    </Group>
    {round && current.length > 0 && <>
      <Text size="xs" fw={600}>{t("queueCurrentRound")}</Text>
      <Progress size="sm" value={(done + failed) / current.length * 100} animated={running} aria-label={t("queueProgress")} />
      <Text size="xs" c="dimmed" data-testid="queue-summary">{fmt(t("queueSummary"), { done, total: current.length, failed, waiting })}</Text>
      <Stack gap={2} data-testid="queue-jobs">{current.map(j => <Group key={j.key} justify="space-between" data-status={j.status} wrap="nowrap" align="flex-start">
        <div><Text size="xs">{label(j, t)}</Text>
          {j.status === "failed" && j.code !== "NOT_IN_ZK" && <Text size="xs" c="dimmed" data-testid="job-reason">{err(j.code)}{j.error && j.error !== j.code ? ` (${j.error.slice(0, 160)})` : ""}</Text>}</div>
        <Badge size="xs" color={j.status === "failed" ? "orange" : j.status === "done" ? "teal" : "gray"}>
          {j.code === "NOT_IN_ZK" ? t("queueNotInZk") : t(`queue_${j.status}` as never)}
        </Badge>
      </Group>)}</Stack>
      {!running && current.filter(j => j.code === "NOT_IN_ZK" && j.item.kind === "building").map(j => <div key={j.key}>
        <Text size="xs" c="dimmed">{label(j, t)}: {t("queueMissingHint")}</Text><MissingActions item={j.item} /></div>)}
    </>}
    {report && report.reason !== "done" && <Alert color="orange" p="xs" data-testid="queue-stop">
      {report.reason === "paused" ? t("queuePaused") : report.reason === "quota" ? t("quotaExhausted") : err(report.code) ?? t("queueStopped")}
    </Alert>}
    {failures.length > 0 && <details data-testid="queue-failures" open={!running && !round ? true : undefined}>
      <summary><Text span size="sm" fw={600} c="orange.8">{t("queuePastFailures")} ({failures.length})</Text></summary>
      <Stack gap={8} mt={6}>{groups.map(([reason, list]) => <Alert key={reason} color={list[0].code === "NOT_IN_ZK" ? "yellow" : "orange"} p="xs" data-testid="failure-group">
        <Group justify="space-between" wrap="wrap" gap={6}>
          <Text size="sm" fw={600} style={{ flex: "1 1 240px" }}>{reason} ({list.length})</Text>
          <Group gap={4}>
            {list[0].code !== "NOT_IN_ZK" && <Button size="compact-xs" disabled={running} onClick={() => void retry(list)}>{fmt(t("queueRetryAll"), { n: list.length })}</Button>}
            <Button size="compact-xs" variant="subtle" color="gray" disabled={running} onClick={() => void remove(list)}>{t("queueRemoveAll")}</Button>
          </Group>
        </Group>
        <Stack gap={4} mt={6}>{list.map(j => <Group key={j.key} justify="space-between" wrap="wrap" gap={4}>
          <div><Text size="sm">{label(j, t)}</Text>
            {j.error && j.error !== j.code && <Text size="xs" c="dimmed">{j.error.slice(0, 160)}</Text>}
            {j.code === "NOT_IN_ZK" && <MissingActions item={j.item} />}</div>
          <Button size="compact-xs" variant="light" disabled={running} onClick={() => void retry([j])} aria-label={`${t("queueRetryOne")} ${j.key}`}>{t("queueRetryOne")}</Button>
        </Group>)}</Stack>
      </Alert>)}</Stack>
    </details>}
  </Stack>;
}
