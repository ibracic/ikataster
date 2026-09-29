import { Badge, Tooltip } from "@mantine/core";
import { IconCloudOff } from "@tabler/icons-react";
import { useI18n } from "../i18n";
import { ageText, useCachedAt } from "./cacheStatus";

/** Shown when GURS data on screen came from the offline cache (GURS down or no connection). */
export function CachedBadge() {
  const at = useCachedAt();
  const { t, lang } = useI18n();
  if (at === null) return null;
  const when = new Date(at).toLocaleString(lang === "sl" ? "sl-SI" : "en-GB");
  return (
    <Tooltip label={`${t("cachedHint")} ${when}`}>
      <Badge data-testid="cached-badge" color="orange" variant="light" size="sm" leftSection={<IconCloudOff size={12} />}>
        {t("cachedData")} · {ageText(at, Date.now(), lang)}
      </Badge>
    </Tooltip>
  );
}
