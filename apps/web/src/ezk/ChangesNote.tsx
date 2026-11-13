import { Badge, Group, List, Text } from "@mantine/core";
import { useI18n, type MsgKey } from "../i18n";
import type { ResultRecord } from "./results";
import type { ChangeKind } from "./diff";

const LABEL: Record<ChangeKind, MsgKey> = {
  ownerAdded: "chgOwnerAdded", ownerRemoved: "chgOwnerRemoved", shareChanged: "chgShare",
  rightAdded: "chgRightAdded", rightRemoved: "chgRightRemoved", pendingAdded: "chgPendingAdded", pendingCleared: "chgPendingCleared",
};
const COLOR: Partial<Record<ChangeKind, string>> = { ownerAdded: "orange", ownerRemoved: "orange", shareChanged: "orange", rightAdded: "red", pendingAdded: "red", rightRemoved: "teal", pendingCleared: "teal" };

const day = (ms: number) => new Date(ms).toLocaleDateString("sl-SI");

/** Badge on a result card after a re-check: "N sprememb" (orange) or "brez sprememb". */
export function ChangesBadge({ record }: { record: ResultRecord }) {
  const { t } = useI18n();
  const c = record.changes;
  if (!c) return null;
  if (!c.items.length) return <Badge size="xs" variant="light" color="gray" data-testid="changes-badge">{t("chgNone")} · {day(c.checkedAt)}</Badge>;
  return <Badge size="xs" variant={c.seen ? "light" : "filled"} color="orange" data-testid="changes-badge">{t("chgCount")}: {c.items.length} · {day(c.checkedAt)}</Badge>;
}

/** List of changes since the previous extract (inside the expanded card). */
export function ChangesList({ record }: { record: ResultRecord }) {
  const { t } = useI18n();
  const c = record.changes;
  if (!c?.items.length) return null;
  return (
    <div data-testid="changes-list">
      <Text size="xs" c="dimmed" tt="uppercase" fw={700} mb={4}>{t("chgTitle")}{c.previousCreatedAt ? ` (${t("chgSince")} ${c.previousCreatedAt.slice(0, 10).split("-").reverse().join(". ")})` : ""}</Text>
      <List size="sm" spacing={2}>
        {c.items.map((i, n) => (
          <List.Item key={n}><Group gap={6} wrap="nowrap"><Badge size="xs" variant="light" color={COLOR[i.kind] ?? "gray"}>{t(LABEL[i.kind])}</Badge><Text size="sm">{i.text}</Text></Group></List.Item>
        ))}
      </List>
    </div>
  );
}
