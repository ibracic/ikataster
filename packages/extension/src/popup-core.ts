/** eZK public extracts page (e-Sodstvo). */
export const EZK_URL = "https://esodisce.si/evlozisce/javni_izpisi/list.html";
export const EZK_MATCH = "https://esodisce.si/*";

export interface TabsApi {
  query(q: { url: string }): Promise<{ id?: number; windowId?: number }[]>;
  update(id: number): Promise<unknown>;
  create(o: { url: string }): Promise<unknown>;
  focusWindow(id: number): Promise<unknown>;
}

export async function ezkTabOpen(tabs: Pick<TabsApi, "query">): Promise<boolean> {
  return (await tabs.query({ url: EZK_MATCH })).length > 0;
}

/** Focus an existing eZK tab, or open the public extracts page. */
export async function openEzk(tabs: TabsApi): Promise<void> {
  const [t] = await tabs.query({ url: EZK_MATCH });
  if (t?.id !== undefined) {
    await tabs.update(t.id);
    if (t.windowId !== undefined) await tabs.focusWindow(t.windowId);
    return;
  }
  await tabs.create({ url: EZK_URL });
}
