import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

let socket = null;

export function useSocket(onEvent) {
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    socket = io(process.env.REACT_APP_WS_URL || '', {
      auth: { token },
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
      callbackRef.current?.({ type: 'connected' });
    });

    socket.on('disconnect', () => {
      callbackRef.current?.({ type: 'disconnected' });
    });

    // Agent events
    socket.on('agent:status:updated', (data) => {
      callbackRef.current?.({ type: 'agent:status:updated', data });
    });

    // Call events
    socket.on('call:incoming', (data) => {
      callbackRef.current?.({ type: 'call:incoming', data });
    });
    socket.on('call:answered', (data) => {
      callbackRef.current?.({ type: 'call:answered', data });
    });
    socket.on('call:ended', (data) => {
      callbackRef.current?.({ type: 'call:ended', data });
    });
    socket.on('call:abandoned', (data) => {
      callbackRef.current?.({ type: 'call:abandoned', data });
    });

    return () => {
      socket?.disconnect();
      socket = null;
    };
  }, []);

  const setStatus = useCallback((status) => {
    socket?.emit('agent:status', { status });
  }, []);

  return { setStatus, socket };
}
