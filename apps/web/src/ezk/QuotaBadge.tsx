import { useEffect, useMemo, useState } from "react";
import { Alert, Group, Progress, Text, Tooltip } from "@mantine/core";
import type { BridgeErrorCode } from "@ikataster/bridge";
import { useI18n } from "../i18n";
import type { BatchPlan, Quota } from "./quota";

export const fmt = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

const ERR_KEYS = ["LIMIT", "NOT_IN_ZK", "EZK_SYSERR", "CAPTCHA", "SESSION_EXPIRED", "INVALID_PDF", "TOO_LARGE", "NO_EZK_TAB"] as const;
type ErrKey = (typeof ERR_KEYS)[number];
/** Friendly message for a classified eZK/bridge error code (null if we have none). */
export function ezkErrorMessage(code: BridgeErrorCode, t: (k: `ezkErr_${ErrKey}`) => string): string | null {
  return (ERR_KEYS as readonly string[]).includes(code) ? t(`ezkErr_${code as ErrKey}`) : null;
}

import { appQuota } from "../queue/instance";
export const defaultQuota = () => appQuota();

/** "eZK danes: X / 400" with a bar, low/exhausted warnings, and an optional batch plan for `pending` items. */
export function QuotaBadge({ quota = defaultQuota(), pending = 0, version = 0 }: { quota?: Quota; pending?: number; /** bump to re-read (e.g. after downloads) */ version?: number }) {
  const { t } = useI18n();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000); // day rollover while open
    const onStorage = () => setTick((n) => n + 1);
    window.addEventListener("storage", onStorage);
    return () => { clearInterval(id); window.removeEventListener("storage", onStorage); };
  }, []);
  const s = useMemo(() => quota.state(), [quota, tick, version]);
  const plan: BatchPlan = useMemo(() => quota.plan(pending), [quota, pending, tick, version]);
  const used = s.exhausted ? quota.limit : Math.min(s.used, quota.limit);
  const color = plan.remaining === 0 ? "red" : plan.remaining <= quota.limit * 0.1 ? "orange" : "teal";
  return (
    <div data-testid="ezk-quota" data-remaining={plan.remaining}>
      <Tooltip label={fmt(t("quotaHint"), { limit: quota.limit })} multiline w={260} withinPortal>
        <Group justify="space-between" gap={6}>
          <Text size="xs" c="dimmed">{t("quotaToday")}</Text>
          <Text size="xs" fw={600}>{used} / {quota.limit}</Text>
        </Group>
      </Tooltip>
      <Progress value={(used / quota.limit) * 100} color={color} size="sm" mt={4} aria-label={t("quotaToday")} />
      {plan.remaining === 0 ? (
        <Alert color="red" variant="light" mt={6} p={6} data-testid="quota-exhausted"><Text size="xs">{t("quotaExhausted")}</Text></Alert>
      ) : plan.deferred > 0 ? (
        <Alert color="orange" variant="light" mt={6} p={6} data-testid="quota-deferred"><Text size="xs">{fmt(t("quotaDeferred"), { allowed: plan.allowed, requested: plan.requested, deferred: plan.deferred })}</Text></Alert>
      ) : plan.warn ? (
        <Text size="xs" c="orange" mt={4}>{fmt(t("quotaLow"), { n: plan.remaining })}</Text>
      ) : null}
    </div>
  );
}
