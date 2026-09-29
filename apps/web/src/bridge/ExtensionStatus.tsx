import { useState } from "react";
import { Alert, Anchor, Badge, Button, Group, List, Modal, Tabs, Text } from "@mantine/core";
import { IconDownload, IconPlugConnected, IconPlugConnectedX } from "@tabler/icons-react";
import { useI18n } from "../i18n";
import { useExtension } from "./useExtension";
import { currentPlatform, isMobile, type Platform } from "../pwa/platform";
import { IconDeviceMobile } from "@tabler/icons-react";

const EZK_URL = "https://esodisce.si/evlozisce/javni_izpisi/list.html";

/** Extension state shown in the cart: detected (+ eZK tab status) or install instructions. */
export function ExtensionStatus({ platform = currentPlatform() }: { platform?: Platform }) {
  const { t } = useI18n();
  const { state, recheck } = useExtension();
  const [help, setHelp] = useState(false);

  return (
    <div data-testid="extension-status" data-state={state.status}>
      {state.status === "checking" && <Text size="xs" c="dimmed">{t("extChecking")}</Text>}
      {state.status === "detected" && (
        <Alert color="teal" variant="light" p="xs" icon={<IconPlugConnected size={16} />}>
          <Group gap={6} wrap="wrap">
            <Text size="sm" fw={600}>{t("extDetected")}</Text>
            <Badge size="xs" variant="outline">v{state.info.version}</Badge>
            {state.mock && <Badge size="xs" color="grape">{t("extMock")}</Badge>}
          </Group>
          {state.ezkTab === false && (
            <Text size="xs" mt={4}>{t("extNoEzkTab")} <Anchor href={EZK_URL} target="_blank" rel="noopener" size="xs">{t("extOpenEzk")}</Anchor></Text>
          )}
          {state.ezkTab === true && <Text size="xs" mt={4}>{t("extEzkTab")}</Text>}
        </Alert>
      )}
      {state.status === "missing" && isMobile(platform) && (
        <Alert color="blue" variant="light" p="xs" icon={<IconDeviceMobile size={16} />} data-testid="ext-mobile">
          <Text size="sm" fw={600}>{t("extMobile")}</Text>
          <Text size="xs">{t("extMobileWhy")}</Text>
        </Alert>
      )}
      {state.status === "missing" && !isMobile(platform) && (
        <Alert color="orange" variant="light" p="xs" icon={<IconPlugConnectedX size={16} />}>
          <Text size="sm" fw={600}>{t("extMissing")}</Text>
          <Text size="xs" mb={6}>{t("extWhy")}</Text>
          <Group gap={6}>
            <Button size="compact-xs" onClick={() => setHelp(true)}>{t("extInstall")}</Button>
            <Button size="compact-xs" variant="subtle" onClick={() => void recheck()}>{t("extRecheck")}</Button>
          </Group>
        </Alert>
      )}
      <InstallModal opened={help} onClose={() => setHelp(false)} />
    </div>
  );
}

export function InstallModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const mobile = typeof window !== "undefined" && window.innerWidth < 640;
  const ff = typeof navigator !== "undefined" && /firefox/i.test(navigator.userAgent);
  return (
    <Modal opened={opened} onClose={onClose} title={<Text fw={700}>{t("extInstallTitle")}</Text>} fullScreen={mobile} size="lg">
      <Text size="sm" mb="sm">{t("extInstallIntro")}</Text>
      <Tabs defaultValue={ff ? "firefox" : "chrome"}>
        <Tabs.List>
          <Tabs.Tab value="chrome">Chrome / Edge</Tabs.Tab>
          <Tabs.Tab value="firefox">Firefox</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="chrome" pt="sm">
          <Button component="a" href="/extension/ikataster-chrome.zip" download size="xs" leftSection={<IconDownload size={14} />} mb="sm">ikataster-chrome.zip</Button>
          <List type="ordered" size="sm" spacing={4}>
            <List.Item>{t("extChrome1")}</List.Item>
            <List.Item>{t("extChrome2")}</List.Item>
            <List.Item>{t("extChrome3")}</List.Item>
            <List.Item>{t("extChrome4")}</List.Item>
          </List>
        </Tabs.Panel>
        <Tabs.Panel value="firefox" pt="sm">
          <Button component="a" href="/extension/ikataster-firefox.zip" download size="xs" leftSection={<IconDownload size={14} />} mb="sm">ikataster-firefox.zip</Button>
          <List type="ordered" size="sm" spacing={4}>
            <List.Item>{t("extFirefox1")}</List.Item>
            <List.Item>{t("extFirefox2")}</List.Item>
            <List.Item>{t("extFirefox3")}</List.Item>
          </List>
        </Tabs.Panel>
      </Tabs>
      <Text size="xs" c="dimmed" mt="md">{t("extPrivacy")}</Text>
    </Modal>
  );
}
