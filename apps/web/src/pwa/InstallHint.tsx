import { useEffect, useState } from "react";
import { Button, CloseButton, Group, Paper, Text } from "@mantine/core";
import { IconDeviceMobileDown, IconShare2 } from "@tabler/icons-react";
import { useI18n } from "../i18n";
import { currentPlatform, HINT_KEY, installHint, isStandalone, type Platform } from "./platform";

interface PromptEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }

/** One-time, dismissible install hint (iOS: Share → Add to Home Screen; Chromium: install button). */
export function InstallHint({ platform = currentPlatform() }: { platform?: Platform }) {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(HINT_KEY) === "1");
  const [prompt, setPrompt] = useState<PromptEvent | null>(null);
  useEffect(() => {
    const on = (e: Event) => { e.preventDefault(); setPrompt(e as PromptEvent); };
    window.addEventListener("beforeinstallprompt", on);
    return () => window.removeEventListener("beforeinstallprompt", on);
  }, []);
  const hint = installHint({ platform, standalone: isStandalone(), dismissed, canPrompt: !!prompt });
  if (!hint) return null;
  const dismiss = () => { localStorage.setItem(HINT_KEY, "1"); setDismissed(true); };

  return (
    <Paper data-testid="install-hint" data-hint={hint} shadow="md" radius="md" p="sm" withBorder
      style={{ position: "absolute", left: 12, right: 12, bottom: "calc(12px + env(safe-area-inset-bottom))", zIndex: 6, maxWidth: 440, margin: "0 auto" }}>
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
        <div>
          <Text size="sm" fw={700}>{t("installTitle")}</Text>
          {hint === "ios" && <Text size="xs">{t("installIos1")} <IconShare2 size={13} style={{ verticalAlign: "-2px" }} /> {t("installIos2")}</Text>}
          {hint === "ios-other" && <Text size="xs">{t("installIosOther")}</Text>}
          {hint === "prompt" && <Text size="xs">{t("installPrompt")}</Text>}
          {hint !== "prompt" && <Text size="xs" c="dimmed" mt={4}>{t("installIosWhy")}</Text>}
          {hint === "prompt" && (
            <Button size="compact-sm" mt={6} leftSection={<IconDeviceMobileDown size={14} />}
              onClick={async () => { await prompt!.prompt(); const c = await prompt!.userChoice; setPrompt(null); if (c.outcome === "accepted") dismiss(); }}>{t("installButton")}</Button>
          )}
        </div>
        <CloseButton aria-label={t("close")} onClick={dismiss} />
      </Group>
    </Paper>
  );
}
