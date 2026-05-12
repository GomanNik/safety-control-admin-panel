// =====================
// src/shared/realtime/mock-bridge.ts
// =====================

export interface MockRealtimeEnvelope {
    channel: string;
    type: string;
    timestamp: number;
    payload: unknown;
}

const MOCK_REALTIME_EVENT_NAME = 'app:mock-realtime';

const canUseWindow = (): boolean => {
    return typeof window !== 'undefined';
};

export const emitMockRealtimeEvent = (
    event: Omit<MockRealtimeEnvelope, 'timestamp'> & {
        timestamp?: number;
    },
): void => {
    if (!canUseWindow()) {
        return;
    }

    window.dispatchEvent(
        new CustomEvent<MockRealtimeEnvelope>(
            MOCK_REALTIME_EVENT_NAME,
            {
                detail: {
                    ...event,
                    timestamp: event.timestamp ?? Date.now(),
                },
            },
        ),
    );
};

export const subscribeMockRealtimeEvent = (
    listener: (event: MockRealtimeEnvelope) => void,
): (() => void) => {
    if (!canUseWindow()) {
        return () => undefined;
    }

    const handleEvent = (
        event: Event,
    ): void => {
        const customEvent = event as CustomEvent<MockRealtimeEnvelope>;

        if (!customEvent.detail) {
            return;
        }

        listener(customEvent.detail);
    };

    window.addEventListener(
        MOCK_REALTIME_EVENT_NAME,
        handleEvent as EventListener,
    );

    return () => {
        window.removeEventListener(
            MOCK_REALTIME_EVENT_NAME,
            handleEvent as EventListener,
        );
    };
};