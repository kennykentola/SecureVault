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
            
            // Configuration for backend URL
            const envUrl = import.meta.env.VITE_BACKEND_WS_URL;
            let wsUrl: string;

            if (envUrl) {
                wsUrl = `${envUrl}/ws/${userId}`;
            } else {
                const host = window.location.hostname;
                const targetHost = (host === 'localhost' && reconnectAttempts.current > 2) ? '127.0.0.1' : host;
                wsUrl = `ws://${targetHost}:8000/ws/${userId}`;
            }
            
            console.log(`Connecting to WebSocket: ${wsUrl}`);
            const socket = new WebSocket(wsUrl);

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
                if (event.code !== 1000 && event.code !== 1001) { // Not a normal closure
                    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), maxReconnectDelay);
                    console.warn(`WebSocket Disconnected (Code: ${event.code}), retrying in ${delay}ms...`);
                    
                    // Clear the current ref if it's the same socket to avoid interference
                    if (ws.current === socket) ws.current = null;
                    
                    setTimeout(() => {
                        if (reconnectAttempts.current > 0) connect();
                    }, delay);
                    reconnectAttempts.current++;
                }
            };

            socket.onerror = (err) => {
                console.error("WebSocket Connection Error. This may be due to backend instability (1011) or network issues.", err);
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

