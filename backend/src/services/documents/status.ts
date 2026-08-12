export function truncateFailureReason(message: string): string {
  if (message.length <= 500) return message;
  return `${message.slice(0, 497)}...`;
}
