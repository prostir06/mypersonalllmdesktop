export const isSameConversation = (
  left: string | number | null,
  right: string | number | null
) => left != null && right != null && String(left) === String(right);
