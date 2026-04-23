import { useEffect, useRef, useState } from 'react';

export const useWebSocket = (userId: string | undefined, onMessage: (msg: any) => void) => {
    const ws = useRef<WebSocket | null>(null);
    const reconnectTimer = useRef<number | null>(null);
    const connectTimer = useRef<number | null>(null);
    const onMessageRef = useRef(onMessage);
    const [status, setStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');
    const reconnectAttempts = useRef(0);
    const maxReconnectDelay = 10000;

    useEffect(() => {
        onMessageRef.current = onMessage;
    }, [onMessage]);

    useEffect(() => {
        if (!userId) return;
        let shouldReconnect = true;

        const connect = () => {
            if (!shouldReconnect) return;
            if (ws.current?.readyState === WebSocket.OPEN || ws.current?.readyState === WebSocket.CONNECTING) return;
            
            setStatus('connecting');
            
            // Configuration for backend URL
            const envUrl = import.meta.env.VITE_BACKEND_WS_URL;
            let wsUrl: string;

            if (envUrl) {
                // Ensure we use the correct protocol (ws or wss) based on the current page or provided URL
                const isHttps = window.location.protocol === 'https:';
                let baseUrl = envUrl.replace(/^http/, 'ws'); // Replaces http with ws, https with wss
                if (isHttps && baseUrl.startsWith('ws:')) {
                    baseUrl = baseUrl.replace('ws:', 'wss:');
                }
                wsUrl = `${baseUrl}/ws/${userId}`;
            } else {
                const host = window.location.hostname;
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const targetHost = (host === 'localhost' && reconnectAttempts.current > 2) ? '127.0.0.1' : host;
                wsUrl = `${protocol}//${targetHost}:8000/ws/${userId}`;
            }
            
            console.log(`Connecting to WebSocket: ${wsUrl}`);
            const socket = new WebSocket(wsUrl);
            ws.current = socket;

            socket.onopen = () => {
                if (ws.current !== socket) {
                    socket.close(1000);
                    return;
                }
                setStatus('connected');
                reconnectAttempts.current = 0;
                console.log("WebSocket Connected");
            };

            socket.onmessage = (event) => {
                if (ws.current !== socket) return;
                try {
                    const data = JSON.parse(event.data);
                    onMessageRef.current(data);
                } catch (e) {
                    console.error("Failed to parse WS message", e);
                }
            };

            socket.onclose = (event) => {
                const isCurrentSocket = ws.current === socket;
                if (isCurrentSocket) {
                    ws.current = null;
                    setStatus('disconnected');
                }
                if (!shouldReconnect) return;
                if (!isCurrentSocket) return;
                if (event.code !== 1000 && event.code !== 1001) { // Not a normal closure
                    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), maxReconnectDelay);
                    console.warn(`WebSocket Disconnected (Code: ${event.code}), retrying in ${delay}ms... (Attempt ${reconnectAttempts.current + 1})`);
                    reconnectAttempts.current++;
                    reconnectTimer.current = window.setTimeout(() => {
                        connect();
                    }, delay);
                }
            };

            socket.onerror = (err) => {
                if (!shouldReconnect || ws.current !== socket) return;
                console.error("WebSocket Connection Error. This may be due to backend instability (1011) or network issues.", err);
                socket.close();
            };
        };

        connectTimer.current = window.setTimeout(() => {
            connect();
        }, 200);
        
        // Heartbeat to keep connection alive on cloud platforms (Render/Heroku)
        const heartbeat = setInterval(() => {
            if (ws.current?.readyState === WebSocket.OPEN) {
                ws.current.send(JSON.stringify({ type: 'ping', timestamp: new Date().toISOString() }));
            }
        }, 30000);

        return () => {
            shouldReconnect = false;
            clearInterval(heartbeat);
            if (connectTimer.current) {
                window.clearTimeout(connectTimer.current);
                connectTimer.current = null;
            }
            if (reconnectTimer.current) {
                window.clearTimeout(reconnectTimer.current);
                reconnectTimer.current = null;
            }
            if (ws.current) {
                const socket = ws.current;
                ws.current = null;
                socket.onclose = null; // Prevent reconnect on intentional unmount
                socket.onerror = null;
                socket.close(1000);
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
