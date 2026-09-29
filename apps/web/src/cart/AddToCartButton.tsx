import { Button } from "@mantine/core";
import { IconCheck, IconFilePlus } from "@tabler/icons-react";
import { useI18n } from "../i18n";
import { itemKey, type CartInput } from "./store";
import { useCart } from "./useCart";

export function AddToCartButton({ item }: { item: CartInput }) {
  const { t } = useI18n();
  const { store, keys } = useCart();
  const inCart = keys.has(itemKey(item));
  return (
    <Button
      size="xs" variant={inCart ? "subtle" : "filled"} color="teal"
      leftSection={inCart ? <IconCheck size={14} /> : <IconFilePlus size={14} />}
      disabled={inCart} onClick={() => void store.add([item])}
    >
      {inCart ? t("inCart") : t("addToCart")}
    </Button>
  );
}
