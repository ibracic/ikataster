import { useState } from "react";
import { ActionIcon, Tooltip } from "@mantine/core";
import { IconCheck, IconShare } from "@tabler/icons-react";
import { useI18n } from "../i18n";

/** Share the current view (the URL already holds the selection). Phones: system share sheet; else copy to clipboard. */
export async function shareLink(url: string, title: string, nav: Navigator = navigator): Promise<"shared" | "copied" | "failed"> {
  const touch = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  if (touch && typeof nav.share === "function") {
    try { await nav.share({ title, url }); return "shared"; }
    catch (e) { if ((e as Error)?.name === "AbortError") return "shared"; }
  }
  try { await nav.clipboard.writeText(url); return "copied"; } catch { return "failed"; }
}

export function ShareButton({ title }: { title: string }) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  const onClick = async () => {
    const r = await shareLink(window.location.href, title);
    if (r === "copied") { setDone(true); setTimeout(() => setDone(false), 1800); }
    else if (r === "failed") window.prompt(t("shareCopy"), window.location.href);
  };
  const label = done ? t("shareCopied") : t("share");
  return (
    <Tooltip label={label} withArrow opened={done || undefined}>
      <ActionIcon variant="subtle" color={done ? "teal" : "gray"} aria-label={t("share")} data-testid="share-btn" onClick={onClick}>
        {done ? <IconCheck size={16} /> : <IconShare size={16} />}
      </ActionIcon>
    </Tooltip>
  );
}
