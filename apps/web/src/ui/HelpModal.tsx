import { Modal, Text, Tabs, List, ThemeIcon, Title, Accordion, Stack, Code } from "@mantine/core";
import { IconInfoCircle, IconDownload, IconLock, IconQuestionMark } from "@tabler/icons-react";

export function HelpModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  return (
    <Modal opened={opened} onClose={onClose} title={<Title order={4}>Pomoč in navodila</Title>} size="lg" zIndex={1000}>
      <Tabs defaultValue="start">
        <Tabs.List>
          <Tabs.Tab value="start" leftSection={<IconInfoCircle size={14} />}>Kako začeti</Tabs.Tab>
          <Tabs.Tab value="faq" leftSection={<IconQuestionMark size={14} />}>Zasebnost in pogosta vprašanja</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="start" pt="md">
          <Text mb="md">
            iKataster vam omogoča enostaven in hiter pregled nad lastništvom in bremeni nepremičnin,
            vendar za prenos izpiskov potrebuje dostop do portala e-ZK. Ker spletne strani med seboj
            zaradi varnosti ne morejo komunicirati, potrebujete majhno razširitev za brskalnik.
          </Text>
          <Title order={5} mb="sm">Koraki za prenos izpiskov</Title>
          <List spacing="sm" size="sm" center icon={<ThemeIcon color="teal" size={24} radius="xl"><IconDownload size={14} /></ThemeIcon>}>
            <List.Item>
              <b>Namestite razširitev</b> iKataster (v Chrome, Edge ali Firefox na računalniku). Povezava je v desnem meniju <i>Seznam za izpise ZK → Navodila za namestitev</i>.
            </List.Item>
            <List.Item>
              V drugem zavihku se <b>prijavite v portal e-Sodstvo (e-ZK)</b> s svojim SI-PASS in zavihek pustite odprt.
            </List.Item>
            <List.Item>
              V tej aplikaciji s klikom na nepremičnine na zemljevidu (ali z orodjem za izris območja) <b>dodajte parcele ali dele stavb na seznam</b> za izpis.
            </List.Item>
            <List.Item>
              Na seznamu kliknite <b>Prenesi izpiske</b>. Razširitev bo preko vaše aktivne seje e-ZK prenesla uradne PDF-je.
            </List.Item>
            <List.Item>
              Aplikacija bo samodejno prebrala PDF-je in vam v pregledni obliki prikazala <b>lastnike in morebitna bremena</b>.
            </List.Item>
          </List>
        </Tabs.Panel>

        <Tabs.Panel value="faq" pt="md">
          <Accordion variant="separated" defaultValue="password">
            <Accordion.Item value="password">
              <Accordion.Control icon={<IconLock size={18} color="gray" />}>Ali aplikacija vidi moje geslo?</Accordion.Control>
              <Accordion.Panel>
                <Text size="sm">Ne. Vaše SI-PASS geslo vnesete izključno na uradni strani e-Sodstva. Aplikacija in razširitev nimata dostopa do vašega gesla.</Text>
              </Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="storage">
              <Accordion.Control icon={<IconLock size={18} color="gray" />}>Kje so shranjeni moji osebni podatki in izpiski?</Accordion.Control>
              <Accordion.Panel>
                <Text size="sm">Izključno na vaši napravi (v vašem brskalniku). Aplikacija <b>nima strežnika in podatkov ne pošilja nikamor</b>. Vse obdelovanje PDF-jev se zgodi na vašem računalniku.</Text>
              </Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="extension">
              <Accordion.Control icon={<IconLock size={18} color="gray" />}>Zakaj sploh potrebujem razširitev za brskalnik?</Accordion.Control>
              <Accordion.Panel>
                <Text size="sm">Brskalniki zaradi varnosti preprečujejo, da bi ena spletna stran brala vsebino drugega zavihka. Razširitev deluje kot strogo nadzorovan mostiček, ki zgolj posreduje zahteve med to aplikacijo in portalom e-ZK ter prenese PDF datoteko nazaj.</Text>
              </Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="limit">
              <Accordion.Control icon={<IconInfoCircle size={18} color="gray" />}>Ali obstaja omejitev prenosov?</Accordion.Control>
              <Accordion.Panel>
                <Text size="sm">Da. e-Sodstvo dovoli približno <b>400 izpiskov na uporabnika na dan</b>. Aplikacija to spremlja in prenose ustavi, preden bi prišlo do blokade vašega računa.</Text>
              </Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="mobile">
              <Accordion.Control icon={<IconInfoCircle size={18} color="gray" />}>Ali zadeva deluje tudi na telefonu?</Accordion.Control>
              <Accordion.Panel>
                <Text size="sm">Na telefonu lahko prosto iščete po GURS podatkih (zemljevid, cene, upravniki, velikosti). Zaradi omejitev mobilnih brskalnikov (ni podpore za razširitve) pa prenos izpiskov ZK v živo <b>deluje samo na računalniku</b>. Vseeno lahko na telefonu ročno naložite in pregledujete že obstoječe PDF izpiske.</Text>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}
