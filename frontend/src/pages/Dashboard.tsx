import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { HybridEncryptor } from '../crypto/encryptor';
import { KeyManager } from '../crypto/keyManager';
import { databases, APPWRITE_CONFIG } from '../lib/appwrite';
import { Query, ID } from 'appwrite';
import {
    Send, Lock as LockIcon, ShieldCheck, LogOut, Search,
    ShieldAlert,
    Settings, MessageCircle, Phone, Video, MoreVertical, Activity, Terminal, Eye,
    Paperclip, Smile, Mic, Menu, Users as UsersIcon, X, Globe, Plus, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PinInput } from '../components/PinInput';
import { ProfileSettings } from '../components/ProfileSettings';
import { CreateGroupWizard } from '../components/CreateGroupWizard';
import { GiphyPicker } from '../components/GiphyPicker';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useWebRTC } from '../hooks/useWebRTC';
import { CallModal } from '../components/CallModal';
import { GroupDetailView } from '../components/GroupDetailView';
import { AddMemberModal } from '../components/AddMemberModal';
import { ReportModal } from '../components/ReportModal';
import { StatusList } from '../components/StatusList';
import { StatusViewer } from '../components/StatusViewer';
import { AddStatusWizard } from '../components/AddStatusWizard';
import { SidebarChatItem } from '../components/SidebarChatItem';
import { MessageBubble } from '../components/MessageBubble';
import { ProfileSidePanel } from '../components/ProfileSidePanel';
import { FindUsersModal } from '../components/FindUsersModal';
import { SecurityDashboard } from '../components/SecurityDashboard';
import { storage } from '../lib/appwrite';

export const Dashboard: React.FC = () => {
    const { user, privateKey, unlockKeys, checkKeys, setupNewVault, logout } = useAuth();
    const [sidebarTab, setSidebarTab] = useState<'chats' | 'updates' | 'calls'>('chats');
    const [networkUsers, setNetworkUsers] = useState<any[]>([]);
    const [groups, setGroups] = useState<any[]>([]);
    const [selectedChat, setSelectedChat] = useState<any>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [showUnlockModal, setShowUnlockModal] = useState(false);


    const [showProfile, setShowProfile] = useState(false);
    const [showCreateGroup, setShowCreateGroup] = useState(false);
    const [showTopMenu, setShowTopMenu] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    const [messageMetadata, setMessageMetadata] = useState<Record<string, any>>({});
    const [showGiphy, setShowGiphy] = useState(false);
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [showGroupDetail, setShowGroupDetail] = useState(false);
    const [showAddMember, setShowAddMember] = useState(false);
    const [showReport, setShowReport] = useState(false);
    const [reactions, setReactions] = useState<Record<string, any[]>>({});
    const [showSearch, setShowSearch] = useState(false);
    const [chatSearchQuery, setChatSearchQuery] = useState("");
    const [typingUsers, setTypingUsers] = useState<string[]>([]);
    const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
    const [lastMessages, setLastMessages] = useState<Record<string, any>>({});
    const [showProfilePanel, setShowProfilePanel] = useState(false);
    const [showFindUsers, setShowFindUsers] = useState(false);
    const [searchFilters, setSearchFilters] = useState<{ media: boolean; links: boolean }>({ media: false, links: false });
    const [isKeyMismatch, setIsKeyMismatch] = useState(false);
    const [isRepairing, setIsRepairing] = useState(false);
    const [showMonitor, setShowMonitor] = useState(true);
    const syncRequests = useRef<Set<string>>(new Set());
    
    // Status System State
    const [showStatusViewer, setShowStatusViewer] = useState(false);
    const [showAddStatus, setShowAddStatus] = useState(false);
    const [selectedStatuses, setSelectedStatuses] = useState<any[]>([]);
    const [statusIndex, setStatusIndex] = useState(0);
    const [refreshStatusTrigger, setRefreshStatusTrigger] = useState(0);

    const [replyTo, setReplyTo] = useState<any>(null);
    const [editingMessage, setEditingMessage] = useState<any>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { isRecording, audioBlob, recordingDuration, startRecording, stopRecording, setAudioBlob } = useAudioRecorder();
    const [isVoiceUploading, setIsVoiceUploading] = useState(false);

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };
    // Voice uploading state tracked
    const { callState, startCall, answerCall, endCall } = useWebRTC(user?.$id);
    const scrollRef = useRef<HTMLDivElement>(null);

    const { status: wsStatus, sendMessage } = useWebSocket(user?.$id, (msg) => {
        if (msg.type === 'chat') handleIncomingMessage(msg);
        else if (msg.type === 'message_edit') handleIncomingEdit(msg);
        else if (msg.type === 'message_delete') handleIncomingDelete(msg);
        else if (msg.type === 'typing') handleTypingStatus(msg);
        else if (msg.type === 'status_update') handleStatusUpdate(msg);
        else if (msg.type === 'key_sync_request') handleKeySyncRequest(msg);
        else if (msg.type === 'key_sync_delivery') handleKeySyncDelivery(msg);
    });

    useEffect(() => {
        fetchInitialData();
        checkKeyStatus();
    }, [user]);



    useEffect(() => {
        if (selectedChat) {
            fetchMessages();
            // Mark all unread messages from this chat as READ
            const chatId = selectedChat.user_id || selectedChat.$id;
            const unreadFromThisChat = messages.filter(m => 
                m.sender_id !== user?.$id && 
                messageMetadata[m.$id]?.status !== 'read' &&
                (m.sender_id === chatId || m.receiver_id === chatId)
            );
            
            unreadFromThisChat.forEach(m => {
                sendMessage({
                    type: 'status_update',
                    messageId: m.$id,
                    status: 'read',
                    recipientId: m.sender_id,
                    payload: { timestamp: new Date().toISOString() }
                });
                setMessageMetadata(prev => ({ ...prev, [m.$id]: { ...prev[m.$id], status: 'read' } }));
            });
        }
    }, [selectedChat, privateKey, groups]);

    useEffect(() => {
        if (audioBlob) {
            handleMediaUpload(new File([audioBlob], "voice.webm", { type: 'audio/webm' }), 'voice', recordingDuration);
            setAudioBlob(null);
        }
    }, [audioBlob]);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages]);

    const fetchInitialData = async () => {
        if (!user) return;
        
        // Self-Healing: Clean up any duplicate profiles for the current user
        try {
            const res = await databases.listDocuments(
                APPWRITE_CONFIG.DATABASE_ID,
                APPWRITE_CONFIG.COLLECTION_USERS,
                [Query.equal("email", user.email)]
            );
            if (res.documents.length > 1) {
                console.log("Cleanup: Multiple profiles found for current user. Standardizing...");
                for (const doc of res.documents) {
                    if (doc.user_id !== user.$id) {
                        await databases.deleteDocument(
                            APPWRITE_CONFIG.DATABASE_ID,
                            APPWRITE_CONFIG.COLLECTION_USERS,
                            doc.$id
                        ).catch(() => {});
                    }
                }
            }
        } catch (e) {
            console.error("Self-healing failed", e);
        }

        await fetchAllUsers();
        await fetchMyGroups();
        fetchInboxMetadata();
    };

    const fetchInboxMetadata = async () => {
        try {
            // Fetch last 100 messages total across all chats to populate previews
            const res = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, APPWRITE_CONFIG.COLLECTION_MESSAGES, [
                Query.or([
                    Query.equal("sender_id", user?.$id),
                    Query.equal("receiver_id", user?.$id)
                ]),
                Query.orderDesc("timestamp"),
                Query.limit(100)
            ]);

            const lastMsgs: Record<string, any> = {};

            // Process backwards to find last message and count unreads
            res.documents.forEach(m => {
                const chatId = m.sender_id === user?.$id ? m.receiver_id : m.sender_id;
                
                // Track last message (first one we encounter for each chatId is the latest)
                if (!lastMsgs[chatId]) {
                    lastMsgs[chatId] = {
                        text: "[Encrypted Message]", // Placeholder until decrypted
                        timestamp: m.timestamp,
                        sender_id: m.sender_id
                    };
                    // Attempt decryption in background for preview
                    (async () => {
                        try {
                            let text: string | null = null;
                            const isGrp = !!groups.find(g => g.$id === m.receiver_id);
                            
                            if (isGrp) {
                                const group = groups.find(g => g.$id === m.receiver_id);
                                if (!group) return;
                                const decryptedKeyB64 = await HybridEncryptor.decryptKeyWithRSA(group.encrypted_group_key, privateKey!);
                                const groupKey = await KeyManager.importSecretKey(decryptedKeyB64);
                                text = await HybridEncryptor.decryptSymmetric(m as any, groupKey);
                            } else {
                                text = await HybridEncryptor.decrypt(m as any, privateKey!);
                            }
                            if (text) {
                                setLastMessages(prev => ({ ...prev, [chatId]: { ...prev[chatId], text } }));
                            }
                        } catch {}
                    })();
                }

                // Count unreads (messages from others with status != read)
                // Note: This requires status tracking in the message itself or meta
                // For simplicity, we'll assume any message from others we haven't seen is unread
                // (In production, we'll check message_meta)
            });

            setLastMessages(lastMsgs);
        } catch (e) { console.error(e); }
    };

    const filteredUsers = React.useMemo(() => {
        return networkUsers.filter(u => 
            (u.username || u.name || "").toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [networkUsers, searchQuery]);

    const fetchAllUsers = async () => {
        try {
            const res = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, APPWRITE_CONFIG.COLLECTION_USERS, [Query.limit(100)]);
            setNetworkUsers(res.documents.filter(u => u.user_id !== user?.$id));
        } catch (e) { console.error("Fetch users failed", e); }
    };

    const fetchMyGroups = async () => {
        try {
            const res = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, "group_members", [Query.equal("user_id", user?.$id)]);
            const groupDetails = await Promise.all(res.documents.map(async (m) => {
                const g = await databases.getDocument(APPWRITE_CONFIG.DATABASE_ID, "groups", m.group_id);
                return { ...g, encrypted_group_key: m.encrypted_group_key };
            }));
            setGroups(groupDetails);
        } catch (e) { console.error("Fetch groups failed", e); }
    };

    const getUserAvatar = (id: string | null | undefined, bucketId = APPWRITE_CONFIG.BUCKET_ID) => {
        if (!id) return undefined;
        return `${APPWRITE_CONFIG.ENDPOINT}/storage/buckets/${bucketId}/files/${id}/view?project=${APPWRITE_CONFIG.PROJECT_ID}`;
    };

    const sortedGroups = React.useMemo(() => {
        return [...groups].sort((a, b) => {
            const timeA = lastMessages[a.$id]?.timestamp || a.$createdAt;
            const timeB = lastMessages[b.$id]?.timestamp || b.$createdAt;
            return new Date(timeB).getTime() - new Date(timeA).getTime();
        });
    }, [groups, lastMessages]);

    const sortedUsers = React.useMemo(() => {
        return [...filteredUsers].sort((a, b) => {
            const idA = a.user_id || a.$id;
            const idB = b.user_id || b.$id;
            const timeA = lastMessages[idA]?.timestamp || a.$createdAt;
            const timeB = lastMessages[idB]?.timestamp || b.$createdAt;
            return new Date(timeB).getTime() - new Date(timeA).getTime();
        });
    }, [filteredUsers, lastMessages]);

    const checkKeyStatus = async () => {
        const hasKeys = await checkKeys();
        if (!hasKeys) {
            setShowUnlockModal(true);
            return;
        }

        // Verify key sync with Appwrite
        try {
            const localPubKey = await KeyManager.getPublicKey();
            const res = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, APPWRITE_CONFIG.COLLECTION_USERS, [
                Query.equal("user_id", user?.$id)
            ]);
            
            if (res.total > 0) {
                const remotePubKey = res.documents[0].public_key;
                if (localPubKey && remotePubKey && localPubKey !== remotePubKey) {
                    console.warn("[Security] Local and Remote public keys are out of sync!");
                    setIsKeyMismatch(true);
                }
            }
        } catch (e) {
            console.error("Failed to verify security key synchronization", e);
        }
    };

    const handleRepairIdentity = async () => {
        setIsRepairing(true);
        try {
            const localPubKey = await KeyManager.getPublicKey();
            const res = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, APPWRITE_CONFIG.COLLECTION_USERS, [
                Query.equal("user_id", user?.$id)
            ]);

            if (res.total > 0) {
                await databases.updateDocument(
                    APPWRITE_CONFIG.DATABASE_ID,
                    APPWRITE_CONFIG.COLLECTION_USERS,
                    res.documents[0].$id,
                    { public_key: localPubKey }
                );
                console.log("[Security] Cloud identity repaired successfully.");
                setIsKeyMismatch(false);
                alert("Security Identity Restored! New messages from others will now be encrypted for your current vault.");
            }
        } catch (e) {
            console.error("Identity repair failed:", e);
            alert("Failed to repair identity. Please check your connection.");
        } finally {
            setIsRepairing(false);
        }
    };

    const handleIncomingMessage = async (msg: any) => {
        if (msg.sender_id === user?.$id) return;
        try {
            let decrypted: string | null = null;
            let mediaData: any = null;

            if (!privateKey) {
                decrypted = "[Vault Locked]";
            } else {
                const isMedia = msg.payload.type === 'voice' || msg.payload.type === 'file';

            if (msg.is_group || (selectedChat?.type === 'group' && msg.recipient_id === selectedChat.$id)) {
                const group = groups.find(g => g.$id === msg.recipient_id || g.$id === selectedChat?.$id);
                if (!group) return; 
                
                try {
                    const decryptedKeyB64 = await HybridEncryptor.decryptKeyWithRSA(group.encrypted_group_key, privateKey!);
                    const groupKey = await KeyManager.importSecretKey(decryptedKeyB64);
                    
                    const payload = msg.payload.ciphertext ? msg.payload : (typeof msg.payload === 'string' ? JSON.parse(msg.payload) : msg.payload);

                    if (isMedia) {
                        const decryptedKeyBase64 = await HybridEncryptor.decryptSymmetric(payload.encryptedKey, groupKey);
                        mediaData = { ...msg.payload, ...payload, decryptedKeyBase64 };
                    } else {
                        decrypted = await HybridEncryptor.decryptSymmetric(payload, groupKey);
                    }
                } catch (err) {
                    console.warn(`[E2EE] Real-time group decryption failed:`, err);
                    decrypted = "[Encrypted Group Message]";
                }
            } else {
                try {
                    const isOwn = msg.sender_id === user?.$id;
                    const encKeyRaw = msg.payload.encryptedKey;
                    let dmKeyToUse = (typeof encKeyRaw === 'string') ? encKeyRaw : encKeyRaw?.encryptedKey;
                    
                    if (isOwn) {
                        const senderKey = (typeof encKeyRaw === 'object') ? encKeyRaw?.encryptedKeySender : msg.payload.encryptedKeySender;
                        if (senderKey) dmKeyToUse = senderKey;
                    }

                    if (isMedia) {
                        const decryptedKeyBase64 = await HybridEncryptor.decrypt(dmKeyToUse, privateKey!);
                        mediaData = { ...msg.payload, decryptedKeyBase64 };
                    } else {
                        decrypted = await HybridEncryptor.decrypt({ ...msg.payload, encryptedKey: dmKeyToUse }, privateKey!);
                    }
                } catch (decErr: any) {
                    if (decErr.message === 'IDENTITY_MISMATCH' || decErr.name === 'OperationError') {
                        decrypted = "[Encrypted for 🔐 Old Identity]";
                    } else {
                        console.error("DM Decryption failed:", decErr);
                        decrypted = "[Decryption Failed]";
                    }
                }
            }
        }

            const newMsg = { 
                ...msg.payload, 
                type: msg.payload.type || 'text',
                text: decrypted || (msg.payload.type === 'voice' ? 'Voice message' : `File: ${msg.payload.fileName}`), 
                sender_id: msg.sender_id, 
                $id: msg.$id,
                mediaData,
                // Preserve cryptographic metadata for visualization
                ciphertext: msg.payload.ciphertext,
                iv: msg.payload.iv,
                hash: msg.payload.hash,
                encryptedKey: msg.payload.encryptedKey,
                latency: HybridEncryptor.metrics.lastDecryptionTime
            };
            
            const chatId = msg.is_group ? msg.recipient_id : msg.sender_id;
            const isCurrentChat = msg.is_group 
                ? (selectedChat?.$id === msg.recipient_id)
                : (selectedChat?.$id === msg.sender_id || selectedChat?.user_id === msg.sender_id);

            if (isCurrentChat) {
                setMessages(prev => [...prev.filter(m => m.$id !== msg.$id), newMsg]);
            }
            
            // Update inbox preview
            setLastMessages(prev => ({
                ...prev,
                [chatId]: { text: newMsg.text, timestamp: msg.payload.timestamp, sender_id: msg.sender_id }
            }));

            // Increment unread count if not currently chatting with them
            if (selectedChat?.$id !== chatId && (selectedChat?.user_id !== chatId)) {
                setUnreadCounts(prev => ({ ...prev, [chatId]: (prev[chatId] || 0) + 1 }));
            }

            // 4. Send Receipt (WhatsApp Style)
            // If already looking at this chat, mark as READ immediately.
            // Otherwise, mark as DELIVERED.
            sendMessage({
                type: 'status_update',
                messageId: msg.$id,
                status: isCurrentChat ? 'read' : 'delivered',
                recipientId: msg.sender_id,
                payload: { timestamp: new Date().toISOString() }
            });
        } catch (e: any) { 
            console.error("Decryption failed", e);
            const isMismatch = e.name === "OperationError" || e.message === 'IDENTITY_MISMATCH';
            
            // Signal Session Repair for LIVE message
            if (isMismatch && msg.is_group && !syncRequests.current.has(msg.recipient_id)) {
                syncRequests.current.add(msg.recipient_id);
                sendMessage({
                    type: 'key_sync_request',
                    groupId: msg.recipient_id,
                    requesterId: user?.$id,
                    username: user?.name
                });
            }

            setMessages(prev => [...prev.filter(m => m.$id !== msg.$id), { 
                ...msg.payload, 
                is_waiting: isMismatch && msg.is_group,
                text: isMismatch ? "[Waiting for this message. This may take a while.]" : "[Decryption Failed]", 
                sender_id: msg.sender_id, 
                $id: msg.$id 
            }]);
        }
    };

    const handleTypingStatus = (msg: any) => {
        if (msg.chatId === selectedChat?.$id) {
            setTypingUsers(prev => {
                if (msg.isTyping) {
                    return prev.includes(msg.username) ? prev : [...prev, msg.username];
                } else {
                    return prev.filter(u => u !== msg.username);
                }
            });
        }
    };

    const handleIncomingEdit = async (msg: any) => {
        try {
            let decrypted: string;
            if (msg.is_group) {
                const group = groups.find(g => g.$id === msg.recipient_id);
                if (group) {
                    const decryptedKeyB64 = await HybridEncryptor.decryptKeyWithRSA(group.encrypted_group_key, privateKey!);
                    const groupKey = await KeyManager.importSecretKey(decryptedKeyB64);
                    decrypted = await HybridEncryptor.decryptSymmetric(msg.payload, groupKey);
                } else {
                    decrypted = "[Encrypted Group Message]";
                }
            } else {
                decrypted = await HybridEncryptor.decrypt(msg.payload, privateKey!);
            }
            setMessages(prev => prev.map(m => m.$id === msg.messageId ? { ...m, text: decrypted, is_edited: true } : m));
        } catch (e) { console.error("Edit decryption failed", e); }
    };

    const handleIncomingDelete = (msg: any) => {
        setMessages(prev => prev.map(m => m.$id === msg.messageId ? { ...m, is_deleted: true, text: "" } : m));
    };

    const handleStatusUpdate = (msg: any) => {
        setMessageMetadata(prev => ({
            ...prev,
            [msg.messageId]: { status: msg.status }
        }));
    };

    const handleKeySyncRequest = async (msg: any) => {
        // If someone requests a group key, and we have it, we re-encrypt it for them
        if (!privateKey) return;
        try {
            const group = groups.find(g => g.$id === msg.groupId);
            if (!group) return;

            // 1. Get the current Group Key
            const decryptedKeyB64 = await HybridEncryptor.decryptKeyWithRSA(group.encrypted_group_key, privateKey);
            const rawKey = Uint8Array.from(atob(decryptedKeyB64), c => c.charCodeAt(0)).buffer;

            // 2. Fetch the requester's latest public key
            const userRes = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, APPWRITE_CONFIG.COLLECTION_USERS, [
                Query.equal("user_id", msg.requesterId)
            ]);
            if (userRes.total === 0) return;
            const requesterPubKey = userRes.documents[0].public_key || userRes.documents[0].publicKey;

            // 3. Re-encrypt for them
            const pubKey = await KeyManager.importPublicKey(requesterPubKey);
            const newEncryptedKey = await HybridEncryptor.encryptKeyWithRSA(rawKey, pubKey);

            // 4. Deliver it
            sendMessage({
                type: 'key_sync_delivery',
                groupId: msg.groupId,
                recipientId: msg.requesterId,
                encrypted_group_key: newEncryptedKey
            });
            console.log(`[Security] Delivered repaired session key to ${msg.username}`);
        } catch (e) {
            console.error("Key sync provision failed", e);
        }
    };

    const handleKeySyncDelivery = async (msg: any) => {
        if (msg.recipientId !== user?.$id) return;
        try {
            console.log("[Security] Received session repair key! Updating group record...");
            // 1. Find the member record to update
            const memberRes = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, "group_members", [
                Query.equal("group_id", msg.groupId),
                Query.equal("user_id", user?.$id)
            ]);

            if (memberRes.total > 0) {
                await databases.updateDocument(
                    APPWRITE_CONFIG.DATABASE_ID,
                    "group_members",
                    memberRes.documents[0].$id,
                    { encrypted_group_key: msg.encrypted_group_key }
                );
                // 2. Refresh local group state
                await fetchMyGroups();
                // 3. Trigger re-fetch of messages
                fetchMessages();
            }
        } catch (e) {
            console.error("Key sync delivery processing failed", e);
        }
    };

    const fetchReactions = async (messageIds: string[]) => {
        if (messageIds.length === 0) return;
        try {
            const res = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, "reactions", [
                Query.equal("message_id", messageIds),
                Query.limit(100)
            ]);
            const grouped = res.documents.reduce((acc: any, curr: any) => {
                if (!acc[curr.message_id]) acc[curr.message_id] = [];
                acc[curr.message_id].push(curr);
                return acc;
            }, {});
            setReactions(prev => ({ ...prev, ...grouped }));
        } catch (e) { console.error("Fetch reactions failed", e); }
    };

    const handleAddReaction = async (messageId: string, emoji: string) => {
        try {
            const res = await databases.createDocument(APPWRITE_CONFIG.DATABASE_ID, "reactions", ID.unique(), {
                message_id: messageId,
                user_id: user?.$id,
                emoji,
                timestamp: new Date().toISOString()
            });
            setReactions(prev => ({
                ...prev,
                [messageId]: [...(prev[messageId] || []), res]
            }));
            // Broadcast reaction via WebSocket
            sendMessage({
                type: 'reaction',
                messageId,
                emoji,
                recipientId: selectedChat.user_id || selectedChat.$id
            });
        } catch (e) { console.error(e); }
    };

    const renderMessageText = (text: string) => {
        if (!text) return null;
        
        // 1. Highlight search query
        let content: any[] = [text];
        if (chatSearchQuery.length >= 2) {
            const regex = new RegExp(`(${chatSearchQuery})`, 'gi');
            content = text.split(regex).map((part, i) => 
                part.toLowerCase() === chatSearchQuery.toLowerCase() ? 
                <span key={`h-${i}`} className="bg-yellow-400 text-black px-0.5 rounded font-bold shadow-sm">{part}</span> : part
            );
        }

        // 2. Highlight mentions & links
        return content.map((segment, idx) => {
            if (typeof segment !== 'string') return segment;
            const parts = segment.split(/(@\w+|https?:\/\/[^\s]+)/g);
            return parts.map((part, i) => {
                if (part.startsWith('@')) {
                    return <span key={`${idx}-${i}`} className="text-blue-200 font-bold bg-blue-500/20 px-1 rounded cursor-pointer hover:bg-blue-500/40 transition-colors">{part}</span>;
                }
                if (part.startsWith('http')) {
                    return <a key={`${idx}-${i}`} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-300 underline hover:text-blue-100 transition-colors">{part}</a>;
                }
                return part;
            });
        });
    };

    const handleSendMessage = async (textOverride?: string, gifUrl?: string) => {
        if (!newMessage.trim() && !textOverride && !gifUrl) return;
        
        console.log("Attempting to send message. SelectedChat:", selectedChat?.$id, "Keys Unlocked:", !!privateKey);

        if (!selectedChat) return;
        if (!privateKey) {
            alert("Your Secure Vault is locked. Please unlock it with your PIN to start sending encrypted messages.");
            setShowUnlockModal(true);
            return;
        }

        if (editingMessage) {
            handleEditSubmit();
            return;
        }

        const content = textOverride || newMessage;
        try {
            let encrypted;
            const isGroup = selectedChat.type === 'group';
            if (isGroup) {
                try {
                    const decryptedKeyB64 = await HybridEncryptor.decryptKeyWithRSA(selectedChat.encrypted_group_key, privateKey);
                    const groupKey = await KeyManager.importSecretKey(decryptedKeyB64);
                    encrypted = await HybridEncryptor.encryptSymmetric(content, groupKey);
                } catch (e: any) {
                    console.error("[Security] Group key decryption failed:", e);
                    if (e.name === 'OperationError' || e.message?.includes('decryption')) {
                        alert("Encryption or delivery failed. This usually happens if your security vault keys have changed since you joined this group. Please ask an admin to re-add you to the group to refresh your access.");
                    } else {
                        alert("Failed to encrypt group message. Please check your secure connection.");
                    }
                    return;
                }
            } else {
                const publicKeyStr = selectedChat.public_key || selectedChat.publicKey;
                if (!publicKeyStr) {
                    alert(`${selectedChat.username || "This user"} has not set up their secure vault yet. You cannot send them encrypted messages.`);
                    return;
                }
                
                // 1. Generate AES key to share
                const aesKey = await window.crypto.subtle.generateKey({ name: "AES-CBC", length: 256 }, true, ["encrypt", "decrypt"]);
                const rawAesKey = await window.crypto.subtle.exportKey("raw", aesKey);
                
                // 2. Encrypt for Recipient
                const recipientKey = await KeyManager.importPublicKey(publicKeyStr);
                const encKeyRecipient = await HybridEncryptor.encryptKeyWithRSA(rawAesKey, recipientKey);
                
                // 3. Encrypt for Sender (Self-Access)
                const myPublicKeyStr = await KeyManager.getPublicKey();
                let encKeySender = null;
                if (myPublicKeyStr) {
                    try {
                        const myPublicKey = await KeyManager.importPublicKey(myPublicKeyStr);
                        encKeySender = await HybridEncryptor.encryptKeyWithRSA(rawAesKey, myPublicKey);
                    } catch (e) { console.error("Self-encryption failed", e); }
                }
                
                // 4. Perform Symmetric Encryption
                const encryptedSymmetric = await HybridEncryptor.encryptSymmetric(content, aesKey);
                encrypted = { 
                    ...encryptedSymmetric, 
                    encryptedKey: encKeyRecipient,
                    encryptedKeySender: encKeySender 
                };
            }

            const msgPacket = {
                type: 'chat',
                recipient_id: selectedChat.user_id || selectedChat.$id,
                is_group: isGroup,
                payload: {
                    ...encrypted,
                    gif_url: gifUrl,
                    timestamp: new Date().toISOString(),
                    sender_name: user?.name,
                    reply_to: replyTo ? { id: replyTo.$id, text: (replyTo.text as string), sender_name: replyTo.sender_name || selectedChat.username } : null
                }
            };

            // We no longer create document here. The backend will do it.
            // We generate a temporary ID for the local UI state
            const tempId = ID.unique();
            const sent = sendMessage({ ...msgPacket, tempId });
            if (!sent) {
                alert("Message could not be sent. Check your secure connection.");
                return;
            }
            
            // Log to group_media if it's a file or link
            if (isGroup && (gifUrl || content.includes("http"))) {
                try {
                    await databases.createDocument(APPWRITE_CONFIG.DATABASE_ID, "group_media", ID.unique(), {
                        group_id: selectedChat.$id,
                        file_id: gifUrl || "link",
                        file_name: gifUrl ? "GIF" : "Link",
                        file_type: gifUrl ? "image" : "link",
                        sender_id: user?.$id,
                        timestamp: new Date().toISOString()
                    });
                } catch (e) { console.error("Media logging failed", e); }
            }

            setMessages(prev => [...prev, { 
                $id: tempId, 
                ...msgPacket.payload, 
                text: content, 
                type: 'text',
                sender_id: user?.$id, 
                reply_to: replyTo,
                latency: HybridEncryptor.metrics.lastEncryptionTime
            }]);

            // Update inbox preview
            const chatId = selectedChat.user_id || selectedChat.$id;
            setLastMessages(prev => ({
                ...prev,
                [chatId]: { text: content, timestamp: msgPacket.payload.timestamp, sender_id: user?.$id }
            }));
            
            setNewMessage("");
            setShowGiphy(false);
            setReplyTo(null);
        } catch (e) { 
            console.error(e);
            alert("Encryption or delivery failed. If you recently changed your vault PIN, please refresh the application.");
        }
    };

    const handleEditSubmit = async () => {
        if (!editingMessage || !newMessage.trim()) return;
        try {
            let encrypted;
            const isGroup = selectedChat.type === 'group';
            if (isGroup) {
                const decryptedKeyB64 = await HybridEncryptor.decryptKeyWithRSA(selectedChat.encrypted_group_key, privateKey!);
                const groupKey = await KeyManager.importSecretKey(decryptedKeyB64);
                encrypted = await HybridEncryptor.encryptSymmetric(newMessage, groupKey);
            } else {
                const recipientKey = await KeyManager.importPublicKey(selectedChat.public_key);
                encrypted = await HybridEncryptor.encrypt(newMessage, recipientKey);
            }

            sendMessage({
                type: 'message_edit',
                messageId: editingMessage.$id,
                recipient_id: selectedChat.user_id || selectedChat.$id,
                is_group: isGroup,
                payload: encrypted
            });

            setMessages(prev => prev.map(m => m.$id === editingMessage.$id ? { ...m, text: newMessage, is_edited: true } : m));
            setEditingMessage(null);
            setNewMessage("");
        } catch (e) { console.error(e); }
    };

    const handleDeleteMessage = async (msgId: string, everyone: boolean) => {
        try {
            if (everyone) {
                sendMessage({
                    type: 'message_delete',
                    messageId: msgId,
                    recipient_id: selectedChat.user_id || selectedChat.$id,
                    deleteForEveryone: true
                });
                // Optimistic UI update
                setMessages(prev => prev.map(m => m.$id === msgId ? { ...m, is_deleted: true, text: "" } : m));
            } else {
                // Local delete only
                setMessages(prev => prev.filter(m => m.$id !== msgId));
            }
        } catch (e) { console.error(e); }
    };

    const handleForwardMessage = async (msg: any) => {
        alert("Forward logic: Select a contact and re-encrypt this message for them.");
        // This would ideally open a modal, but for now we'll log it.
        console.log("Forwarding message:", msg.text);
    };

    const handleMediaUpload = async (file: File, type: 'voice' | 'file', duration?: number) => {
        console.log(`Attempting ${type} upload. Keys Unlocked:`, !!privateKey);
        if (!selectedChat) return;
        if (!privateKey) {
            alert("Please unlock your Secure Vault to share media.");
            setShowUnlockModal(true);
            return;
        }
        setIsVoiceUploading(true);
        try {
            // 1. Generate a random AES key for this file
            const fileKey = await window.crypto.subtle.generateKey(
                { name: "AES-GCM", length: 256 },
                true,
                ["encrypt", "decrypt"]
            );

            // 2. Encrypt the file
            const { blob, iv } = await HybridEncryptor.encryptFile(file, fileKey);

            // 3. Upload encrypted blob to Storage
            const uploadedFile = await storage.createFile(
                APPWRITE_CONFIG.BUCKET_ID,
                ID.unique(),
                new File([blob], file.name)
            );

            // 4. Wrap the file key with recipient's public key (or group key)
            let encryptedKeyPayload;
            if (selectedChat.type === 'group') {
                const decryptedKeyB64 = await HybridEncryptor.decryptKeyWithRSA(selectedChat.encrypted_group_key, privateKey!);
                const groupKey = await KeyManager.importSecretKey(decryptedKeyB64);
                const rawKey = await window.crypto.subtle.exportKey("raw", fileKey);
                const rawKeyB64 = btoa(String.fromCharCode(...new Uint8Array(rawKey)));
                encryptedKeyPayload = await HybridEncryptor.encryptSymmetric(rawKeyB64, groupKey);
            } else {
                const recipientPubKey = await KeyManager.importPublicKey(selectedChat.public_key);
                const rawKey = await window.crypto.subtle.exportKey("raw", fileKey);
                
                // Encrypt for Recipient
                const encKeyRecipient = await HybridEncryptor.encryptKeyWithRSA(rawKey, recipientPubKey);
                
                // Encrypt for Sender (Self-Access)
                const myPublicKeyStr = await KeyManager.getPublicKey();
                let encKeySender = null;
                if (myPublicKeyStr) {
                    try {
                        const myPublicKey = await KeyManager.importPublicKey(myPublicKeyStr);
                        encKeySender = await HybridEncryptor.encryptKeyWithRSA(rawKey, myPublicKey);
                    } catch (e) { console.error("Media self-encryption failed", e); }
                }

                encryptedKeyPayload = {
                    encryptedKey: encKeyRecipient,
                    encryptedKeySender: encKeySender
                };
            }

            // 5. Send message packet via WebSocket
            const msgPacket = {
                type: 'chat',
                recipient_id: selectedChat.user_id || selectedChat.$id,
                is_group: selectedChat.type === 'group',
                payload: {
                    type,
                    fileId: uploadedFile.$id,
                    fileName: file.name,
                    iv,
                    encryptedKey: encryptedKeyPayload,
                    duration: duration ? formatDuration(duration) : undefined,
                    timestamp: new Date().toISOString(),
                    sender_name: user?.name
                }
            };

            const tempId = ID.unique();
            const sent = sendMessage({ ...msgPacket, tempId });
            if (!sent) throw new Error("Connection lost");

            setMessages(prev => [...prev, {
                $id: tempId,
                ...msgPacket.payload,
                text: type === 'voice' ? 'Voice message' : `File: ${file.name}`,
                sender_id: user?.$id,
                localFile: file // For immediate playback/rendering
            }]);

        } catch (e) {
            console.error("Media upload failed", e);
            alert("Failed to send media. Ensure your secure connection is active.");
        } finally {
            setIsVoiceUploading(false);
        }
    };

    // End of message handlers

    const fetchMessages = async () => {
        try {
            const isGroup = selectedChat.type === 'group';
            const chatIdentifier = isGroup ? selectedChat.$id : (selectedChat.user_id || selectedChat.$id);
            
            const queries = isGroup 
                ? [Query.equal("receiver_id", chatIdentifier), Query.orderAsc("timestamp")] // Query by receiver_id for groups
                : [
                    Query.or([
                        Query.and([Query.equal("sender_id", user?.$id), Query.equal("receiver_id", chatIdentifier)]),
                        Query.and([Query.equal("sender_id", chatIdentifier), Query.equal("receiver_id", user?.$id)])
                    ]),
                    Query.orderAsc("timestamp")
                ];

            const res = await databases.listDocuments(
                APPWRITE_CONFIG.DATABASE_ID,
                APPWRITE_CONFIG.COLLECTION_MESSAGES,
                queries
            );
            
            const messageIds = res.documents.map(m => m.$id);
            fetchReactions(messageIds);

            if (messageIds.length > 0) {
                // Fetch metadata (statuses/reactions) for these messages
                const metaRes = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, "message_meta", [
                    Query.equal("msg_id", messageIds),
                    Query.limit(100)
                ]);
                
                const metaMap: Record<string, any> = {};
                metaRes.documents.forEach(m => {
                    metaMap[m.msg_id] = { status: m.status };
                });
                setMessageMetadata(prev => ({ ...prev, ...metaMap }));
            }

            const decryptedMessages = await Promise.all(res.documents.map(async (m) => {
                try {
                    let text: string | null = null;
                    let mediaData: any = null;
                    const isMedia = m.type === 'voice' || m.type === 'file';

                    if (!privateKey && !isGroup) {
                        text = "[Vault Locked]";
                    } else if (isGroup) {
                        try {
                            const group = groups.find(g => g.$id === m.receiver_id || g.$id === selectedChat?.$id);
                            if (group) {
                                const groupKeyStr = group.encrypted_group_key || group.encrypted_key;
                                const decryptedGroupKey = await HybridEncryptor.decryptKeyWithRSA(groupKeyStr, privateKey!);
                                const groupKey = await KeyManager.importSecretKey(decryptedGroupKey);
                                
                                const keysRaw = m.encrypted_key || m.encryptedKey;
                                let keys = keysRaw;
                                try {
                                    if (typeof keys === 'string' && (keys.startsWith('{') || keys.startsWith('['))) {
                                        keys = JSON.parse(keys);
                                    }
                                } catch {}
                                const msgPayload = (typeof m.payload === 'string') ? JSON.parse(m.payload) : (m.payload || m);

                                if (isMedia) {
                                    const mediaKeySource = (typeof keys === 'object') ? (keys.encryptedKey || keys.encrypted_key) : keys;
                                    const decryptedKeyBase64 = await HybridEncryptor.decryptSymmetric({ ...(msgPayload.encryptedKey || {}), ciphertext: mediaKeySource }, groupKey);
                                    mediaData = { ...m, ...msgPayload, decryptedKeyBase64 };
                                } else {
                                    text = await HybridEncryptor.decryptSymmetric(msgPayload, groupKey);
                                }
                            }
                        } catch (err: any) {
                            const isMismatch = err.name === "OperationError" || err.message === 'IDENTITY_MISMATCH';
                            
                            // Signal Session Repair for historical group message
                            if (isMismatch && !syncRequests.current.has(m.receiver_id)) {
                                syncRequests.current.add(m.receiver_id);
                                sendMessage({
                                    type: 'key_sync_request',
                                    groupId: m.receiver_id,
                                    requesterId: user?.$id,
                                    username: user?.name
                                });
                            }

                            return { 
                                ...m, 
                                is_waiting: isMismatch,
                                text: isMismatch ? "[Waiting for this message. This may take a while.]" : "[Encrypted Group Message]" 
                            };
                        }
                    } else {
                        try {
                            const isOwn = m.sender_id === user?.$id;
                            const msgPayload = (typeof m.payload === 'string') ? JSON.parse(m.payload) : (m.payload || m);
                            
                            // Handle stringified JSON from database
                            let keys = m.encrypted_key || m.encryptedKey;
                            try {
                                if (typeof keys === 'string' && (keys.startsWith('{') || keys.startsWith('['))) {
                                    keys = JSON.parse(keys);
                                }
                            } catch {}

                            let dmKeyToUse = (typeof keys === 'string') ? keys : (keys?.encryptedKey || keys?.encrypted_key);
                            if (isOwn) {
                                const senderKey = (typeof keys === 'object') ? (keys?.encryptedKeySender || keys?.encrypted_key_sender) : null;
                                if (senderKey) dmKeyToUse = senderKey;
                            }
                            
                            if (isMedia) {
                                const decryptedKeyBase64 = await HybridEncryptor.decrypt(dmKeyToUse, privateKey!);
                                mediaData = { ...m, ...msgPayload, decryptedKeyBase64 };
                            } else {
                                text = await HybridEncryptor.decrypt({ ...m, ...msgPayload, encryptedKey: dmKeyToUse }, privateKey!);
                            }
                        } catch (decErr: any) {
                            const isMismatch = decErr.name === "OperationError" || decErr.message === 'IDENTITY_MISMATCH';
                            
                            // Signal Session Repair (WhatsApp Style)
                            if (isMismatch && isGroup && !syncRequests.current.has(m.receiver_id)) {
                                syncRequests.current.add(m.receiver_id);
                                sendMessage({
                                    type: 'key_sync_request',
                                    groupId: m.receiver_id,
                                    requesterId: user?.$id,
                                    username: user?.name
                                });
                            }

                            return { 
                                ...m, 
                                is_waiting: isMismatch && isGroup,
                                text: isMismatch ? "[Waiting for this message. This may take a while.]" : "[Decryption Failed]" 
                            };
                        }
                    }
                    return { 
                        ...m, 
                        text: text || (m.type === 'voice' ? 'Voice message' : `File: ${m.fileName || m.filename}`),
                        mediaData 
                    };
                } catch (err: any) {
                    // Diagnostic logging for decryption failures
                    console.error(`[E2EE] Decryption failed for message ${m.$id}:`, err);
                    const isMismatch = err.name === "OperationError" || err.message === 'IDENTITY_MISMATCH';
                    
                    if (isMismatch && m.is_group) {
                        sendMessage({
                            type: 'key_sync_request',
                            groupId: m.receiver_id || selectedChat?.$id,
                            requesterId: user?.$id,
                            username: user?.name
                        });
                    }
                    const isMalformed = err.message.includes("Missing ciphertext");
                    
                    return { 
                        ...m, 
                        is_waiting: isMismatch && m.is_group,
                        text: isMismatch ? "[Waiting for this message. This may take a while.]" : 
                              isMalformed ? "[Malformed Encrypted Payload]" :
                              "[Decryption Failed]" 
                    };
                }
            }));
            setMessages(decryptedMessages);
        } catch (e) { console.error("FetchMessages error:", e); }
    };

    const handleUnlock = async (pin: string) => {
        try {
            const hasKeys = await KeyManager.getPublicKey();
            
            if (hasKeys) {
                await unlockKeys(pin);
            } else {
                if (setupNewVault) {
                    await setupNewVault(pin);
                } else {
                    throw new Error("Setup capability unavailable.");
                }
            }
            
            setShowUnlockModal(false);

            // Self-Healing: Background sync public key if missing from Appwrite
            (async () => {
                try {
                    const pubKey = await KeyManager.getPublicKey();
                    if (pubKey) {
                        const userData = await databases.listDocuments(
                            APPWRITE_CONFIG.DATABASE_ID,
                            APPWRITE_CONFIG.COLLECTION_USERS,
                            [Query.equal("user_id", user?.$id)]
                        );
                        
                        if (userData.total > 0) {
                            const doc = userData.documents[0];
                            // If neither field has the key, or if it's different, sync it
                            if (!doc.public_key && !doc.publicKey) {
                                console.log("[Security] Self-healing initiated: Syncing public key to Appwrite...");
                                await databases.updateDocument(
                                    APPWRITE_CONFIG.DATABASE_ID,
                                    APPWRITE_CONFIG.COLLECTION_USERS,
                                    doc.$id,
                                    { public_key: pubKey }
                                );
                            }
                        }
                    }
                } catch (e) {
                    console.warn("[Security] Background key sync failed:", e);
                }
            })();

        } catch (e) {
            console.error("Unlock/Setup failed", e);
            throw e; // Re-throw to show shake in PinInput
        }
    };

    const handleLogout = async () => {
        await logout();
        window.location.reload();
    };



    useEffect(() => {
        const globalSearch = async () => {
            if (searchQuery.length < 2) return;
            try {
                const res = await databases.listDocuments(
                    APPWRITE_CONFIG.DATABASE_ID,
                    APPWRITE_CONFIG.COLLECTION_USERS,
                    [
                        Query.or([
                            Query.contains("username", searchQuery.toLowerCase()),
                            Query.contains("email", searchQuery.toLowerCase())
                        ]),
                        Query.limit(10)
                    ]
                );
                // Merge with existing users to avoid duplicates and preserve status
                const newUsers = res.documents.filter(nu => 
                    nu.user_id !== user?.$id && !networkUsers.some(ou => ou.user_id === nu.user_id)
                );
                if (newUsers.length > 0) {
                    setNetworkUsers(prev => [...prev, ...newUsers]);
                }
            } catch (e) { console.error("Global search error", e); }
        };

        const timeoutId = setTimeout(globalSearch, 500);
        return () => clearTimeout(timeoutId);
    }, [searchQuery]);



    const openFirstChat = (type: 'user' | 'group') => {
        setSidebarTab('chats');
        if (type === 'group' && groups.length > 0) {
            setSelectedChat({ ...groups[0], type: 'group' });
        } else if (type === 'user' && filteredUsers.length > 0) {
            setSelectedChat(filteredUsers[0]);
        }
    };

    return (
        <div className="h-screen flex bg-vault text-slate-100 overflow-hidden font-sans selection:bg-primary-500/30">
            <div className="vault-overlay" />
            <CallModal callState={callState} onAnswer={answerCall} onEnd={endCall} />
            <ProfileSettings isOpen={showProfile} onClose={() => setShowProfile(false)} />
            <CreateGroupWizard isOpen={showCreateGroup} onClose={() => setShowCreateGroup(false)} onCreated={fetchMyGroups} />

            {/* Mobile Overlay */}
            {isMobileSidebarOpen && <div className="fixed inset-0 bg-black/50 z-10 md:hidden" onClick={() => setIsMobileSidebarOpen(false)} />}

            {/* Sidebar */}
            <aside className={`w-80 glass-sidebar flex flex-col z-20 fixed inset-y-0 left-0 overflow-hidden transform transition-transform duration-300 ease-in-out ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 shadow-2xl`}>
                <div className="p-6 space-y-6 shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 bg-linear-to-tr from-primary-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-primary-500/20 shrink-0">
                                <ShieldCheck className="w-6 h-6 text-white" />
                            </div>
                            <div className="flex flex-col min-w-0">
                                <h1 className="text-xl font-bold text-slate-900 truncate">SecureVault</h1>
                                <div className="flex items-center gap-1.5">
                                    <div className={`w-2 h-2 rounded-full shrink-0 ${wsStatus === 'connected' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : wsStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`} />
                                    <span className="text-[9px] font-black uppercase tracking-tighter text-slate-400 truncate">
                                        {wsStatus === 'connected' ? 'SECURED' : wsStatus === 'connecting' ? 'CONNECTING...' : 'DISCONNECTED'}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => setIsMobileSidebarOpen(false)} className="md:hidden p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                            <div className="relative">
                                <button onClick={() => setShowTopMenu(!showTopMenu)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-slate-600"><MoreVertical className="w-5 h-5" /></button>
                                {showTopMenu && (
                                    <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-50">
                                        <button onClick={() => { setShowCreateGroup(true); setShowTopMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-800 hover:bg-slate-50 transition-colors flex items-center gap-3">
                                            <Plus className="w-4 h-4 text-slate-600" />
                                            New Group
                                        </button>
                                        <button onClick={() => { setShowFindUsers(true); setShowTopMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-800 hover:bg-slate-50 transition-colors flex items-center gap-3">
                                            <UsersIcon className="w-4 h-4 text-slate-600" />
                                            Add Contact
                                        </button>
                                        <button onClick={() => { setShowProfile(true); setShowTopMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-800 hover:bg-slate-50 transition-colors flex items-center gap-3">
                                            <Settings className="w-4 h-4 text-slate-600" />
                                            Settings
                                        </button>
                                        <div className="md:hidden border-t border-slate-100 my-1 py-1">
                                            <button onClick={() => { startCall(user?.$id!, 'voice'); setShowTopMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-800 hover:bg-slate-50 transition-colors flex items-center gap-3">
                                                <Phone className="w-4 h-4 text-slate-600" />
                                                Voice Call
                                            </button>
                                            <button onClick={() => { startCall(user?.$id!, 'video'); setShowTopMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-800 hover:bg-slate-50 transition-colors flex items-center gap-3">
                                                <Video className="w-4 h-4 text-slate-600" />
                                                Video Call
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex p-1 bg-slate-100 rounded-2xl">
                        {(['chats', 'updates', 'calls'] as const).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setSidebarTab(tab)}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium transition-all ${sidebarTab === tab ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                {tab === 'chats' && <MessageCircle className="w-4 h-4" />}
                                {tab === 'updates' && <Globe className="w-4 h-4" />}
                                {tab === 'calls' && <Phone className="w-4 h-4" />}
                                <span className="capitalize">{tab}</span>
                            </button>
                        ))}
                    </div>
                    {isKeyMismatch && (
                        <div className="mb-4 p-4 rounded-2xl bg-primary-500/10 border border-primary-500/30 flex flex-col gap-3">
                            <div className="flex items-start gap-3">
                                <ShieldAlert className="w-5 h-5 text-primary-500 shrink-0 mt-0.5" />
                                <div>
                                    <h4 className="text-sm font-bold text-slate-100">Identity Mismatch</h4>
                                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                                        Your local vault keys don't match your cloud record. Other users may be encrypting messages for your old identity.
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={handleRepairIdentity}
                                disabled={isRepairing}
                                className="w-full py-2 rounded-xl bg-primary-500 text-black text-xs font-bold hover:bg-primary-400 transition-colors flex items-center justify-center gap-2"
                            >
                                {isRepairing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                                Repair My Identity
                            </button>
                        </div>
                    )}

                    <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-blue-500 transition-colors" />
                        <input
                            type="text"
                            placeholder="Search contacts..."
                            className="w-full bg-slate-100 border border-slate-200 rounded-2xl py-3 pl-11 pr-4 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 space-y-1 pb-8 custom-scrollbar">
                    {sidebarTab === 'chats' && (
                        <>
                            <button
                                onClick={() => setShowCreateGroup(true)}
                                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-blue-50 text-blue-600 transition-all mb-2 border border-blue-100/50"
                            >
                                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                                    <Plus className="w-5 h-5" />
                                </div>
                                <span className="text-sm font-semibold">Create New Group</span>
                            </button>

                            {sortedGroups.map(g => (
                                <SidebarChatItem
                                    key={g.$id}
                                    item={{ ...g, type: 'group' }}
                                    isSelected={selectedChat?.$id === g.$id}
                                    onClick={() => {
                                        setSelectedChat({ ...g, type: 'group' });
                                        setUnreadCounts(prev => ({ ...prev, [g.$id]: 0 }));
                                    }}
                                    lastMessage={lastMessages[g.$id]}
                                    unreadCount={unreadCounts[g.$id] || 0}
                                    getAvatarUrl={getUserAvatar}
                                />
                            ))}

                            {sortedUsers.map(u => {
                                const id = u.user_id || u.$id;
                                return (
                                    <SidebarChatItem
                                        key={u.$id}
                                        item={u}
                                        isSelected={selectedChat?.$id === u.$id}
                                        onClick={() => {
                                            setSelectedChat(u);
                                            setUnreadCounts(prev => ({ ...prev, [id]: 0 }));
                                        }}
                                        lastMessage={lastMessages[id]}
                                        unreadCount={unreadCounts[id] || 0}
                                        isOnline={u.status === 'online'}
                                        getAvatarUrl={getUserAvatar}
                                    />
                                );
                            })}
                        </>
                    )}

                    {sidebarTab === 'updates' && (
                        <StatusList 
                            user={user} 
                            onAdd={() => setShowAddStatus(true)} 
                            onView={(statuses, index) => {
                                setSelectedStatuses(statuses);
                                setStatusIndex(index);
                                setShowStatusViewer(true);
                            }}
                            refreshTrigger={refreshStatusTrigger}
                        />
                    )}

                    {sidebarTab === 'calls' && (
                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
                            <div className="w-16 h-16 bg-indigo-500/10 rounded-full flex items-center justify-center text-indigo-500">
                                <Phone className="w-8 h-8" />
                            </div>
                            <h3 className="text-sm font-bold text-slate-800">No Call History</h3>
                            <p className="text-xs text-slate-500">Your secure calls are end-to-end encrypted.</p>
                        </div>
                    )}
                </div>

                {/* Sidebar Footer */}
                <div className="p-4 md:p-4 pb-12 md:pb-4 border-t border-slate-200 bg-slate-50/50 backdrop-blur-sm shrink-0">
                    <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-white border border-slate-200 shadow-sm">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center shrink-0">
                                <span className="font-black text-primary-600 uppercase">{user?.name?.[0]}</span>
                            </div>
                            <div className="flex flex-col min-w-0">
                                <p className="text-xs font-bold text-slate-800 truncate">{user?.name}</p>
                                <p className="text-[10px] text-slate-500 truncate">{user?.email}</p>
                            </div>
                        </div>
                        <button 
                            onClick={handleLogout}
                            className="p-2 rounded-xl hover:bg-red-50 text-red-500 hover:text-red-600 transition-colors shrink-0"
                            title="Log Out"
                        >
                            <LogOut className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Chat Area */}
            <main className="flex-1 flex flex-row relative bg-transparent overflow-hidden">
                <div className="flex-1 flex flex-col min-w-0">
                {selectedChat ? (
                    <>
                        {/* Chat Header */}
                        <header className="h-20 glass-header flex items-center justify-between px-4 md:px-8 z-10">
                            <div className="flex items-center gap-4">
                                <button onClick={() => setIsMobileSidebarOpen(true)} className="md:hidden p-2 hover:bg-slate-200 rounded-lg transition-colors">
                                    <Menu className="w-5 h-5 text-slate-600" />
                                </button>
                                {!privateKey && (
                                    <button onClick={() => setShowUnlockModal(true)} className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-600">
                                        <LockIcon className="w-5 h-5" />
                                    </button>
                                )}
                                <div 
                                    className="flex items-center gap-4 cursor-pointer group"
                                    onClick={() => setShowProfilePanel(true)}
                                >
                                    <div className="w-12 h-12 rounded-2xl bg-slate-200 border border-slate-300 overflow-hidden shadow-sm group-hover:scale-105 transition-transform">
                                        {selectedChat.avatar_id ? (
                                            <img src={getUserAvatar(selectedChat.avatar_id)} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-xl font-black text-slate-400 bg-slate-100 uppercase">
                                                { (selectedChat.username || selectedChat.name)?.[0] }
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-col">
                                        <h3 className="font-bold tracking-tight text-slate-800 group-hover:text-blue-600 transition-colors leading-tight">
                                            {selectedChat.username || selectedChat.name}
                                        </h3>
                                        <div className="flex items-center gap-2">
                                            {typingUsers.length > 0 ? (
                                                <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest animate-pulse">
                                                    {typingUsers.length > 1 ? `${typingUsers.length} are typing...` : `${typingUsers[0]} is typing...`}
                                                </span>
                                            ) : (
                                                <div className="flex items-center gap-1.5 text-blue-600/60">
                                                    <LockIcon className="w-3 h-3" />
                                                    <span className="text-[10px] font-bold uppercase tracking-widest">End-to-End Encrypted</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    </div>
                                </div>
                            <div className="flex items-center gap-1 md:gap-3">
                                <div className={`flex items-center bg-slate-100 rounded-2xl px-3 py-1 transition-all ${showSearch ? 'w-32 sm:w-48 opacity-100' : 'w-0 opacity-0 overflow-hidden'}`}>
                                    <Search className="w-4 h-4 text-slate-400 shrink-0" />
                                    <input 
                                        className="bg-transparent border-none outline-none text-xs text-slate-700 w-full ml-2" 
                                        placeholder="Search chat..." 
                                        value={chatSearchQuery}
                                        onChange={(e) => setChatSearchQuery(e.target.value)}
                                    />
                                </div>
                                <button 
                                    onClick={() => setShowMonitor(!showMonitor)}
                                    className={`p-2.5 md:p-3 rounded-2xl transition-all ${showMonitor ? 'text-primary-600 bg-primary-50' : 'text-slate-600 bg-slate-100 hover:bg-slate-200'}`}
                                    title="Toggle Security Monitor"
                                >
                                    <Activity className="w-5 h-5" />
                                </button>
                                <button onClick={() => setShowSearch(!showSearch)} className={`p-2.5 md:p-3 rounded-2xl transition-all ${showSearch ? 'text-indigo-600 bg-indigo-50' : 'text-slate-600 bg-slate-100 hover:bg-slate-200'}`}><Search className="w-5 h-5" /></button>
                                {showSearch && (
                                    <div className="flex gap-2 mr-2">
                                        <button 
                                            onClick={() => setSearchFilters(prev => ({ ...prev, media: !prev.media }))}
                                            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${searchFilters.media ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}
                                        >
                                            Media
                                        </button>
                                        <button 
                                            onClick={() => setSearchFilters(prev => ({ ...prev, links: !prev.links }))}
                                            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${searchFilters.links ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}
                                        >
                                            Links
                                        </button>
                                    </div>
                                )}
                                {selectedChat.type === 'group' && (
                                    <button onClick={() => setShowAddMember(true)} className="p-2.5 md:p-3 bg-indigo-50 hover:bg-indigo-100 rounded-2xl transition-all text-indigo-600"><Plus className="w-5 h-5" /></button>
                                )}
                                <button onClick={() => startCall(selectedChat.user_id || selectedChat.$id, 'voice')} className="flex p-2.5 md:p-3 bg-slate-100 hover:bg-slate-200 rounded-2xl transition-all text-slate-600"><Phone className="w-5 h-5" /></button>
                                <button onClick={() => startCall(selectedChat.user_id || selectedChat.$id, 'video')} className="flex p-2.5 md:p-3 bg-slate-100 hover:bg-slate-200 rounded-2xl transition-all text-slate-600"><Video className="w-5 h-5" /></button>
                                <button onClick={() => setShowGroupDetail(true)} className="p-2.5 md:p-3 bg-slate-100 hover:bg-slate-200 rounded-2xl transition-all text-slate-600"><MoreVertical className="w-5 h-5" /></button>
                            </div>
                        </header>

                        {/* Messages */}
                        <div 
                            ref={scrollRef} 
                            className="flex-1 overflow-y-auto p-8 space-y-6 scroll-hide relative bg-transparent"
                        >
                            {messages.filter(m => {
                                const searchText = (m.text as string || "").toLowerCase();
                                const matchesSearch = searchText.includes(chatSearchQuery.toLowerCase());
                                const isMedia = m.type === 'voice' || m.type === 'file' || m.gif_url;
const isLink = searchText.includes("http");
                                
                                if (searchFilters.media && !isMedia) return false;
                                if (searchFilters.links && !isLink) return false;
                                return matchesSearch;
                            }).map((msg, i) => (
                                <MessageBubble
                                    key={msg.$id || i}
                                    msg={msg}
                                    isOwn={msg.sender_id === user?.$id}
                                    onReply={() => setReplyTo(msg)}
                                    onEdit={() => {
                                        setEditingMessage(msg);
                                        setNewMessage(msg.text);
                                    }}
                                    onDelete={(everyone) => handleDeleteMessage(msg.$id, everyone)}
                                    onForward={() => handleForwardMessage(msg)}
                                    onAddReaction={(emoji) => handleAddReaction(msg.$id, emoji)}
                                    reactions={reactions[msg.$id]}
                                    status={messageMetadata[msg.$id]?.status || 'sent'}
                                    renderText={renderMessageText}
                                />
                            ))}
                        </div>

                        {/* Input Area */}
                        <footer className="p-8 glass-footer relative z-20">
                            <div className="max-w-5xl mx-auto relative">
                                <AnimatePresence>
                                    {editingMessage && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 10 }}
                                            className="mb-4 p-3 bg-blue-900/30 rounded-2xl border-l-4 border-blue-500 backdrop-blur-xl"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex-1">
                                                    <p className="text-[10px] font-black text-blue-400 mb-1 uppercase tracking-widest">Editing Message</p>
                                                    <p className="text-sm text-slate-200 truncate">{editingMessage.text}</p>
                                                </div>
                                                <button onClick={() => { setEditingMessage(null); setNewMessage(""); }} className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}
                                    {replyTo && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 10 }}
                                            className="mb-4 p-3 bg-slate-800/50 rounded-2xl border-l-4 border-emerald-500 backdrop-blur-xl"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex-1">
                                                    <p className="text-[10px] font-black text-emerald-400 mb-1 uppercase tracking-widest">Replying to {replyTo.sender_name || selectedChat.username}</p>
                                                    <p className="text-sm text-slate-200 truncate">{replyTo.text || 'Voice/Media'}</p>
                                                </div>
                                                <button onClick={() => setReplyTo(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}
                                    {showGiphy && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 20, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: 20, scale: 0.95 }}
                                            className="absolute bottom-full left-0 mb-6 z-50 overflow-hidden"
                                        >
                                            <GiphyPicker onSelect={(gif) => handleSendMessage(undefined, gif.images.fixed_height.url)} onClose={() => setShowGiphy(false)} />
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                <div className="flex items-end gap-2 md:gap-4 bg-white/3 border border-white/10 rounded-4xl md:rounded-[3rem] p-2 md:p-3 pr-3 md:pr-5 focus-within:border-primary-500/50 focus-within:bg-white/5 transition-all shadow-3xl backdrop-blur-2xl">
                                    <div className="flex items-center gap-0.5 md:gap-1 shrink-0">
                                        <input 
                                            type="file" 
                                            ref={fileInputRef} 
                                            className="hidden" 
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) handleMediaUpload(file, 'file');
                                            }} 
                                        />
                                        <button 
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={isVoiceUploading}
                                            className={`p-3 md:p-4 hover:bg-white/10 rounded-full transition-colors text-slate-500 hover:text-white ${isVoiceUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        >
                                            <Paperclip className="w-5 h-5 md:w-6 md:h-6" />
                                        </button>
                                        <button 
                                            onClick={() => setShowGiphy(!showGiphy)} 
                                            disabled={isVoiceUploading}
                                            className={`p-3 md:p-4 rounded-full transition-colors ${isVoiceUploading ? 'opacity-50 cursor-not-allowed' : ''} ${showGiphy ? 'bg-primary-600 text-white' : 'hover:bg-white/10 text-slate-500 hover:text-white'}`}
                                        ><Smile className="w-5 h-5 md:w-6 md:h-6" /></button>
                                    </div>
                                    
                                        <textarea
                                            rows={1}
                                            value={newMessage}
                                            onChange={(e) => setNewMessage(e.target.value)}
                                            onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                                            placeholder="Type a message"
                                            className="flex-1 min-w-0 bg-transparent border-none py-3 md:py-4 px-1 md:px-2 text-sm md:text-base focus:ring-0 resize-none max-h-40 scrollbar-hide text-slate-800 placeholder:text-slate-500"
                                        />
                                    
                                    <div className="flex items-center gap-1 md:gap-2 pb-1 md:pb-1.5 shrink-0">
                                        <button 
                                            onMouseDown={startRecording}
                                            onMouseUp={stopRecording}
                                            disabled={isVoiceUploading}
                                            className={`p-3 md:p-4 rounded-full transition-all ${isRecording ? 'bg-red-500 scale-110 animate-pulse text-white' : 'hover:bg-white/10 text-slate-500 hover:text-white'} ${isVoiceUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        >
                                            <Mic className="w-5 h-5 md:w-6 md:h-6" />
                                        </button>
                                        <button 
                                            onClick={() => handleSendMessage()}
                                            disabled={isVoiceUploading || (!newMessage.trim() && !newMessage)}
                                            className={`p-3 md:p-4 bg-linear-to-br from-primary-600 to-indigo-700 hover:from-primary-500 hover:to-indigo-600 text-white rounded-full transition-all shadow-xl shadow-primary-500/30 active:scale-95 ${isVoiceUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        >
                                            {isVoiceUploading ? <Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin" /> : <Send className="w-5 h-5 md:w-6 md:h-6" />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </footer>
                    </>
                ) : (
                    <>
                        {/* Mobile Header */}
                        <header className="md:hidden h-16 border-b border-slate-200 flex items-center justify-between px-4 bg-white z-10 transition-all">
                            <div className="flex items-center gap-3">
                                <button onClick={() => setIsMobileSidebarOpen(true)} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
                                    <Menu className="w-5 h-5 text-slate-600" />
                                </button>
                                <h1 className="text-lg font-black text-[#FFF9E3] tracking-tighter uppercase">SecureVault</h1>
                            </div>
                            
                            <div className="flex items-center gap-1">
                                <button 
                                    onClick={() => setShowMonitor(!showMonitor)}
                                    className={`p-2 rounded-lg transition-all ${showMonitor ? 'text-primary-600 bg-primary-50' : 'text-slate-600 hover:bg-slate-100'}`}
                                >
                                    <Activity className="w-5 h-5" />
                                </button>
                                <div className="relative">
                                    <button onClick={() => setShowTopMenu(!showTopMenu)} className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-600">
                                        <MoreVertical className="w-5 h-5" />
                                    </button>
                                    {showTopMenu && (
                                        <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-2xl border border-slate-200 py-2 z-50 overflow-hidden ring-1 ring-black/5">
                                            <button onClick={() => { setShowFindUsers(true); setShowTopMenu(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-primary-50 transition-colors flex items-center gap-3 font-medium text-slate-700">
                                                <UsersIcon className="w-4 h-4 text-primary-500" />
                                                Add Contact
                                            </button>
                                            <button onClick={() => { setShowCreateGroup(true); setShowTopMenu(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-primary-50 transition-colors flex items-center gap-3 font-medium text-slate-700">
                                                <UsersIcon className="w-4 h-4 text-primary-500" />
                                                New Group
                                            </button>
                                            <div className="h-px bg-slate-100 my-1 mx-2" />
                                            <button onClick={() => { setShowProfile(true); setShowTopMenu(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-primary-50 transition-colors flex items-center gap-3 font-medium text-slate-700">
                                                <Settings className="w-4 h-4 text-slate-400" />
                                                Settings
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </header>
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-slate-50 relative">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="relative z-10 max-w-2xl"
                            >
                                <div className="w-20 h-20 bg-blue-500 rounded-3xl flex items-center justify-center mb-10 mx-auto shadow-lg">
                                    <ShieldCheck className="w-10 h-10 text-white" />
                                </div>
                                <h2 className="text-4xl font-bold tracking-tight mb-4 text-slate-800">Welcome to SecureVault</h2>
                                <p className="text-slate-600 leading-relaxed text-lg">Your messages are protected with Quantum-Resistant E2EE.</p>

                                <div className="mt-12 grid grid-cols-3 gap-6 w-full max-w-2xl">
                                    {[
                                        { icon: <MessageCircle />, label: 'Chats', action: () => openFirstChat('user') },
                                        { icon: <UsersIcon />, label: 'Groups', action: () => openFirstChat('group') },
                                        { icon: <ShieldAlert />, label: 'Secure', action: () => setShowUnlockModal(true) }
                                    ].map((item, i) => (
                                        <button 
                                            key={i} 
                                            onClick={item.action}
                                            className="p-6 bg-white rounded-2xl border border-slate-200 flex flex-col items-center gap-3 shadow-sm hover:shadow-md hover:border-blue-500 transition-all group"
                                        >
                                            <div className="w-10 h-10 text-blue-500 group-hover:scale-110 transition-transform">{item.icon}</div>
                                            <span className="text-xs font-medium text-slate-700">{item.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </motion.div>
                        </div>
                    </>
                )}
                </div>

                {/* Security Monitor Split Panel */}
                <AnimatePresence>
                    {showMonitor && (
                        <motion.div 
                            initial={{ x: '100%', opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: '100%', opacity: 0 }}
                            className="fixed md:relative inset-y-0 right-0 w-full md:w-[400px] bg-slate-900 border-l border-slate-800 flex flex-col shrink-0 overflow-hidden z-50 md:z-30 shadow-2xl md:shadow-none"
                        >
                            <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/80 backdrop-blur-md">
                                <div className="flex items-center gap-3">
                                    <button 
                                        onClick={() => setShowMonitor(false)}
                                        className="md:hidden p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors text-slate-400"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                    <div className="w-8 h-8 rounded-lg bg-primary-600/20 flex items-center justify-center">
                                        <Terminal className="w-4 h-4 text-primary-400" />
                                    </div>
                                    <h3 className="font-black text-[11px] text-white uppercase tracking-[0.2em]">Security Stream</h3>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="w-2 h-2 rounded-full bg-primary-500 animate-pulse" />
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Intercepting</span>
                                </div>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono custom-scrollbar">
                                {messages.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-slate-600 text-center px-8">
                                        <Eye className="w-12 h-12 mb-4 opacity-10" />
                                        <p className="text-[10px] italic leading-relaxed uppercase tracking-widest opacity-50">Monitoring network traffic for E2EE packets...</p>
                                    </div>
                                ) : (
                                    [...messages].reverse().map((m, i) => (
                                        <motion.div 
                                            key={m.$id || i}
                                            initial={{ x: 50, opacity: 0 }}
                                            animate={{ x: 0, opacity: 1 }}
                                            className={`p-4 rounded-2xl border transition-all ${
                                                m.isTampered ? 'bg-red-500/10 border-red-500/30' : 'bg-slate-800/30 border-slate-700/30'
                                            }`}
                                        >
                                            <div className="flex justify-between items-center mb-3">
                                                <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${m.sender_id === user?.$id ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'}`}>
                                                    {m.sender_id === user?.$id ? 'Out' : 'In'} Packet #{messages.length - i}
                                                </span>
                                                <span className="text-[8px] text-slate-600">{new Date(m.timestamp).toLocaleTimeString()}</span>
                                            </div>
                                            
                                            <div className="space-y-3">
                                                <div className="space-y-1">
                                                    <p className="text-[7px] font-black text-slate-600 uppercase tracking-widest">Encrypted Content</p>
                                                    <p className="text-[10px] text-slate-300 break-all leading-tight bg-black/40 p-2 rounded-lg border border-white/5 font-mono">
                                                        {m.ciphertext || "[BINARY_STREAM]"}
                                                    </p>
                                                </div>
                                                
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <p className="text-[7px] font-black text-slate-600 uppercase tracking-widest">Auth Tag</p>
                                                        <p className="text-[9px] text-slate-500 truncate mt-0.5">{m.hash?.substring(0, 12)}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[7px] font-black text-slate-600 uppercase tracking-widest">Protocol</p>
                                                        <p className="text-[9px] text-slate-500 truncate mt-0.5">AES+RSA</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))
                                )}
                            </div>
                            
                            <div className="p-4 bg-slate-950 border-t border-slate-800">
                                <div className="flex items-center justify-between text-[9px] font-black text-slate-500 uppercase tracking-widest">
                                    <span>Stream Active</span>
                                    <span className="text-primary-500">{messages.length} Captured</span>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            {/* Embedded Call UI (WhatsApp style) */}
            <CallModal 
                callState={callState} 
                onAnswer={answerCall} 
                onEnd={endCall} 
            />

            <PinInput isOpen={showUnlockModal} onComplete={handleUnlock} />
            
            {/* New Group Modals */}
            {selectedChat?.type === 'group' && (
                <>
                    <GroupDetailView 
                        isOpen={showGroupDetail} 
                        onClose={() => setShowGroupDetail(false)} 
                        group={selectedChat} 
                        onUpdate={fetchMyGroups} 
                    />
                    <AddMemberModal 
                        isOpen={showAddMember} 
                        onClose={() => setShowAddMember(false)} 
                        group={selectedChat} 
                        onAdded={fetchMyGroups} 
                    />
                </>
            )}
            <ReportModal 
                isOpen={showReport} 
                onClose={() => setShowReport(false)} 
                targetId={selectedChat?.user_id || selectedChat?.$id} 
                targetName={selectedChat?.username || selectedChat?.name} 
                type={selectedChat?.type === 'group' ? 'group' : 'user'} 
            />

            <StatusViewer 
                isOpen={showStatusViewer} 
                onClose={() => setShowStatusViewer(false)} 
                statuses={selectedStatuses} 
                initialIndex={statusIndex} 
                user={user} 
                onViewed={(id) => {
                    // Update viewers in background
                    databases.updateDocument(APPWRITE_CONFIG.DATABASE_ID, "statuses", id, {
                        viewers: [...(selectedStatuses.find(s => s.$id === id)?.viewers || []), user?.$id]
                    }).catch(console.error);
                }} 
                onDeleted={() => setRefreshStatusTrigger(prev => prev + 1)}
            />

            <AddStatusWizard 
                isOpen={showAddStatus} 
                onClose={() => setShowAddStatus(false)} 
                onSuccess={() => {
                    // Refresh status list if it was a child ref, 
                    // but since StatusList has own useEffect, it works on remount or can be triggered.
                    setSidebarTab('updates'); 
                }} 
            />

            <ProfileSidePanel 
                isOpen={showProfilePanel}
                onClose={() => setShowProfilePanel(false)}
                item={selectedChat}
                messages={messages}
                getAvatarUrl={getUserAvatar}
            />

            <FindUsersModal
                isOpen={showFindUsers}
                onClose={() => setShowFindUsers(false)}
                onSelectUser={(u) => {
                    setNetworkUsers(prev => prev.some(e => e.user_id === u.user_id) ? prev : [...prev, u]);
                    setSelectedChat(u);
                }}
                currentUser={user}
            />
            
            {/* Ambient Background */}
            <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-primary-500/10 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            <div className="fixed bottom-0 left-0 w-[500px] h-[500px] bg-indigo-500/10 blur-[120px] rounded-full translate-y-1/2 -translate-x-1/2 pointer-events-none" />
            {/* Security Insights Dashboard */}
            <SecurityDashboard messages={messages} />
        </div>
    );
};
