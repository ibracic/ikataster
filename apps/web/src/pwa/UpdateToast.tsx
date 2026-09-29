import { useEffect, useState } from "react";
import { Button, Group, Paper, Text } from "@mantine/core";
import { useI18n } from "../i18n";

/** A new service worker took over (new deploy): offer a reload so the page runs the new version. */
export function UpdateToast() {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  useEffect(() => {
    const sw = navigator.serviceWorker;
    if (!sw) return;
    const hadController = !!sw.controller; // first install is not an "update"
    const on = () => { if (hadController) setShow(true); };
    sw.addEventListener("controllerchange", on);
    return () => sw.removeEventListener("controllerchange", on);
  }, []);
  if (!show) return null;
  return (
    <Paper data-testid="update-toast" shadow="md" radius="md" p="xs" withBorder
      style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: 110, zIndex: 7 }}>
      <Group gap="xs" wrap="nowrap">
        <Text size="sm">{t("updateReady")}</Text>
        <Button size="compact-sm" onClick={() => window.location.reload()}>{t("updateReload")}</Button>
      </Group>
    </Paper>
  );
}
