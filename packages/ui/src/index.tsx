import type { JSX } from 'react';
export function StatusBadge({ state }: { state: string }): JSX.Element {
  return <span role="status" aria-label={`Status ${state}`}>{state}</span>;
}
export function EmptyState({ message }: { message: string }): JSX.Element {
  return <p role="status">{message}</p>;
}
export function ErrorState({ message }: { message: string }): JSX.Element {
  return <p role="alert">{message}</p>;
}
