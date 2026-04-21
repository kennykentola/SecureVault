import { useEffect, useRef, useState } from 'react';

export const useWebSocket = (userId: string | undefined, onMessage: (msg: any) => void) => {
    const ws = useRef<WebSocket | null>(null);
    const [status, setStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');
    const reconnectAttempts = useRef(0);
    const maxReconnectDelay = 10000;

    useEffect(() => {
        if (!userId) return;

        const connect = () => {
            if (ws.current?.readyState === WebSocket.OPEN) return;
            
            setStatus('connecting');
            const host = window.location.hostname;
            // Fallback: If localhost fails, some Windows environments prefer 127.0.0.1
            const targetHost = (host === 'localhost' && reconnectAttempts.current > 2) ? '127.0.0.1' : host;
            
            console.log(`Connecting to WebSocket: ws://${targetHost}:8000/ws/${userId}`);
            const socket = new WebSocket(`ws://${targetHost}:8000/ws/${userId}`);

            socket.onopen = () => {
                setStatus('connected');
                reconnectAttempts.current = 0;
                console.log("WebSocket Connected");
            };

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    onMessage(data);
                } catch (e) {
                    console.error("Failed to parse WS message", e);
                }
            };

            socket.onclose = (event) => {
                setStatus('disconnected');
                if (event.code !== 1000) { // Not a normal closure
                    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), maxReconnectDelay);
                    console.log(`WebSocket Disconnected (Code: ${event.code}), retrying in ${delay}ms...`);
                    setTimeout(connect, delay);
                    reconnectAttempts.current++;
                }
            };

            socket.onerror = (err) => {
                console.error("WebSocket Error:", err);
                socket.close();
            };

            ws.current = socket;
        };

        connect();

        return () => {
            if (ws.current) {
                ws.current.onclose = null; // Prevent reconnect on intentional unmount
                ws.current.close(1000);
            }
        };
    }, [userId]);

    const sendMessage = (message: any) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify(message));
            return true;
        }
        console.warn("Could not send message: WebSocket is not open.");
        return false;
    };

    return { status, sendMessage };
};

