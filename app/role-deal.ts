export type NumberedCardDraw<T> = {
  card: T;
  index: number;
  remaining: T[];
};

export function takeNumberedCard<T>(deck: readonly T[], cardNumber: number): NumberedCardDraw<T> | null {
  const index = cardNumber - 1;
  if (!Number.isInteger(cardNumber) || index < 0 || index >= deck.length) return null;

  return {
    card: deck[index],
    index,
    remaining: deck.filter((_, currentIndex) => currentIndex !== index),
  };
}

export function restoreNumberedCard<T>(deck: readonly T[], cardNumber: number, card: T): T[] {
  const index = Math.min(Math.max(cardNumber - 1, 0), deck.length);
  const restored = [...deck];
  restored.splice(index, 0, card);
  return restored;
}
