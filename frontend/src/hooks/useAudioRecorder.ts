import { useState, useRef, useCallback } from 'react';

export const useAudioRecorder = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [audioMimeType, setAudioMimeType] = useState('audio/webm');
    const [recordingDuration, setRecordingDuration] = useState(0);
    const timerRef = useRef<ReturnType<typeof window.setInterval> | null>(null);
    const mediaRecorder = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunks = useRef<Blob[]>([]);
    const discardRecordingRef = useRef(false);
    const MIN_BLOB_BYTES = 500; // ignore blobs smaller than 500 bytes (silence)

    const clearTimer = () => {
        if (timerRef.current) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
        }
    };

    const stopStream = () => {
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    };

    const getSupportedMimeType = () => {
        if (typeof MediaRecorder === 'undefined') return '';

        const preferredMimeTypes = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/ogg',
            'audio/mp4'
        ];

        return preferredMimeTypes.find(mimeType => MediaRecorder.isTypeSupported(mimeType)) || '';
    };

    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            discardRecordingRef.current = false;

            const supportedMimeType = getSupportedMimeType();
            mediaRecorder.current = supportedMimeType
                ? new MediaRecorder(stream, { mimeType: supportedMimeType })
                : new MediaRecorder(stream);
            chunks.current = [];
            setRecordingDuration(0);
            setAudioBlob(null);
            setAudioMimeType(mediaRecorder.current.mimeType || supportedMimeType || 'audio/webm');

            mediaRecorder.current.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.current.push(e.data);
            };

            mediaRecorder.current.onstop = () => {
                const resolvedMimeType = mediaRecorder.current?.mimeType || supportedMimeType || 'audio/webm';
                const blob = new Blob(chunks.current, { type: resolvedMimeType });

                if (discardRecordingRef.current) {
                    discardRecordingRef.current = false;
                    setAudioBlob(null);
                } else if (blob.size >= MIN_BLOB_BYTES) {
                    setAudioMimeType(resolvedMimeType);
                    setAudioBlob(blob);
                } else {
                    setAudioBlob(null);
                    alert('Voice note was too short. Record for at least 1 second and try again.');
                }

                chunks.current = [];
                stopStream();
                clearTimer();
            };

            mediaRecorder.current.start(250);
            setIsRecording(true);

            timerRef.current = setInterval(() => {
                setRecordingDuration(prev => prev + 1);
            }, 1000);

        } catch (e) {
            console.error("Audio recording failed:", e);
            stopStream();
            clearTimer();
            alert("Microphone access denied or not available.");
        }
    }, []);

    const stopRecording = useCallback(() => {
        if (mediaRecorder.current && isRecording) {
            mediaRecorder.current.stop();
            setIsRecording(false);
            // Timer cleared in onstop
        }
    }, [isRecording]);

    const cancelRecording = useCallback(() => {
        if (mediaRecorder.current && isRecording) {
            discardRecordingRef.current = true;
            mediaRecorder.current.stop();
            setIsRecording(false);
            setAudioBlob(null);
            chunks.current = [];
            setRecordingDuration(0);
            clearTimer();
        }
    }, [isRecording]);

    // Click-to-toggle: one click starts, next click stops
    const toggleRecording = useCallback(() => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    }, [isRecording, startRecording, stopRecording]);

    return { isRecording, audioBlob, audioMimeType, recordingDuration, startRecording, stopRecording, cancelRecording, toggleRecording, setAudioBlob };
};
