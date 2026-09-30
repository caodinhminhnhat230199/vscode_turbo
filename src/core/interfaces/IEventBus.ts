import { VsTurboEvents } from '../events/eventTypes';

export type EventCallback<T> = (data: T) => void;

export interface IEventBus {
  on<K extends keyof VsTurboEvents>(
    event: K,
    callback: EventCallback<VsTurboEvents[K]>
  ): () => void;
  off<K extends keyof VsTurboEvents>(event: K, callback: EventCallback<VsTurboEvents[K]>): void;
  emit<K extends keyof VsTurboEvents>(event: K, data: VsTurboEvents[K]): void;
  clear(): void;
}
