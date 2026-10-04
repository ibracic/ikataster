import { Modal, Text, Tabs, List, ThemeIcon, Title, Accordion } from "@mantine/core";
import { IconInfoCircle, IconDownload, IconLock, IconQuestionMark } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useI18n } from "../i18n";

type Content = {
  title: string; start: string; faq: string; intro: string; stepsTitle: string;
  steps: ReactNode[]; questions: { id: string; q: string; a: ReactNode; lock?: boolean }[];
};

const CONTENT: Record<"sl" | "en", Content> = {
  sl: {
    title: "Pomoč in navodila",
    start: "Kako začeti",
    faq: "Zasebnost in vprašanja",
    intro: "iKataster prikazuje lastništvo in bremena nepremičnin. Za prenos izpiskov iz zemljiške knjige potrebuje dostop do portala e-ZK. Ker spletne strani zaradi varnosti ne morejo brati drugih zavihkov, potrebujete majhno razširitev za brskalnik.",
    stepsTitle: "Koraki za prenos izpiskov",
    steps: [
      <><b>Namestite razširitev</b> iKataster (Chrome, Edge ali Firefox na računalniku). Navodila so v <i>Seznam za izpise ZK → Navodila za namestitev</i>.</>,
      <>V drugem zavihku se <b>prijavite v e-Sodstvo (e-ZK)</b> s SI-PASS in zavihek pustite odprt.</>,
      <>Na zemljevidu (klik, izris območja ali uvoz seznama) <b>dodajte parcele ali dele stavb na seznam</b>.</>,
      <>Na seznamu kliknite <b>prenos</b>. Razširitev prek vaše seje e-ZK prenese uradne PDF-je.</>,
      <>Aplikacija PDF-je prebere in pokaže <b>lastnike in bremena</b>.</>,
    ],
    questions: [
      { id: "password", lock: true, q: "Ali aplikacija vidi moje geslo?", a: "Ne. Geslo SI-PASS vnesete samo na uradni strani e-Sodstva." },
      { id: "storage", lock: true, q: "Kje so shranjeni izpiski?", a: <>Samo v vašem brskalniku. Aplikacija <b>nima strežnika</b> in podatkov ne pošilja nikamor.</> },
      { id: "extension", lock: true, q: "Zakaj potrebujem razširitev?", a: "Brskalnik ne dovoli, da bi ena stran brala drug zavihek. Razširitev je dovoljen most, ki komunicira samo z iKatastrom in e-ZK." },
      { id: "limit", q: "Ali obstaja omejitev?", a: <>Da. e-Sodstvo dovoli približno <b>400 izpiskov na uporabnika na dan</b>. Aplikacija jih šteje in se ustavi pred mejo.</> },
      { id: "mobile", q: "Ali deluje na telefonu?", a: <>Iskanje in zemljevid da. Prenos izpiskov potrebuje razširitev, zato <b>samo na računalniku</b>. Na telefonu lahko naložite PDF-je, ki jih že imate.</> },
    ],
  },
  en: {
    title: "Help & instructions",
    start: "Getting started",
    faq: "Privacy & FAQ",
    intro: "iKataster shows property owners and charges. To download land-registry extracts it needs the e-ZK portal. For security, a website can't read other tabs, so you need a small browser extension.",
    stepsTitle: "How to download extracts",
    steps: [
      <><b>Install the iKataster extension</b> (Chrome, Edge or Firefox on a computer). Steps are under <i>Land-registry extract list → Installation instructions</i>.</>,
      <>In another tab, <b>log in to e-Sodstvo (e-ZK)</b> with SI-PASS and keep that tab open.</>,
      <>On the map (click, draw an area or import a list) <b>add parcels or building parts to the list</b>.</>,
      <>In the list, click <b>download</b>. The extension fetches the official PDFs through your e-ZK session.</>,
      <>The app reads the PDFs and shows <b>owners and charges</b>.</>,
    ],
    questions: [
      { id: "password", lock: true, q: "Does the app see my password?", a: "No. You enter your SI-PASS password only on the official e-Sodstvo pages." },
      { id: "storage", lock: true, q: "Where are extracts stored?", a: <>Only in your browser. The app <b>has no server</b> and sends your data nowhere.</> },
      { id: "extension", lock: true, q: "Why do I need the extension?", a: "Browsers don't let one site read another tab. The extension is the permitted bridge and talks only to iKataster and e-ZK." },
      { id: "limit", q: "Is there a limit?", a: <>Yes. e-Sodstvo allows about <b>400 extracts per user per day</b>. The app counts them and stops before the limit.</> },
      { id: "mobile", q: "Does it work on a phone?", a: <>Search and the map do. Downloading needs the extension, so <b>computer only</b>. On a phone you can upload PDFs you already have.</> },
    ],
  },
};

export function HelpModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { lang } = useI18n();
  const c = CONTENT[lang === "en" ? "en" : "sl"];
  return (
    <Modal opened={opened} onClose={onClose} title={<Title order={4}>{c.title}</Title>} size="lg" zIndex={1000}>
      <Tabs defaultValue="start">
        <Tabs.List>
          <Tabs.Tab value="start" leftSection={<IconInfoCircle size={14} />}>{c.start}</Tabs.Tab>
          <Tabs.Tab value="faq" leftSection={<IconQuestionMark size={14} />}>{c.faq}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="start" pt="md">
          <Text size="sm" mb="md">{c.intro}</Text>
          <Title order={5} mb="sm">{c.stepsTitle}</Title>
          <List spacing="sm" size="sm" icon={<ThemeIcon color="teal" size={22} radius="xl"><IconDownload size={13} /></ThemeIcon>}>
            {c.steps.map((s, i) => <List.Item key={i}>{s}</List.Item>)}
          </List>
        </Tabs.Panel>
        <Tabs.Panel value="faq" pt="md">
          <Accordion variant="separated" defaultValue="password">
            {c.questions.map((q) => (
              <Accordion.Item key={q.id} value={q.id}>
                <Accordion.Control icon={q.lock ? <IconLock size={18} /> : <IconInfoCircle size={18} />}>{q.q}</Accordion.Control>
                <Accordion.Panel><Text size="sm">{q.a}</Text></Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}
