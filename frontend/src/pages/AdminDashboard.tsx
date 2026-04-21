import React, { useState, useEffect } from 'react';
import { databases, APPWRITE_CONFIG } from '../lib/appwrite';
import { Query } from 'appwrite';
import { Users, AlertTriangle, Activity, ShieldAlert, Trash2, Ban, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export const AdminDashboard: React.FC = () => {
    const [users, setUsers] = useState<any[]>([]);
    const [reports, setReports] = useState<any[]>([]);
    const [stats, setStats] = useState({ totalUsers: 0, totalMessages: 0, pendingReports: 0 });

    useEffect(() => {
        fetchAdminData();
    }, []);

    const fetchAdminData = async () => {
        try {
            const [usersRes, messagesRes, reportsRes] = await Promise.all([
                databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, APPWRITE_CONFIG.COLLECTION_USERS),
                databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, APPWRITE_CONFIG.COLLECTION_MESSAGES, [Query.limit(1)]),
                databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, APPWRITE_CONFIG.COLLECTION_REPORTS)
            ]);

            setUsers(usersRes.documents);
            setReports(reportsRes.documents);
            setStats({
                totalUsers: usersRes.total,
                totalMessages: messagesRes.total,
                pendingReports: reportsRes.documents.filter(r => r.status === 'pending').length
            });
        } catch (e) {
            console.error("Admin fetch error", e);
        }
    };


    const handleAction = async (userId: string, action: 'block' | 'delete') => {
        try {
            if (action === 'block') {
                await databases.updateDocument(
                    APPWRITE_CONFIG.DATABASE_ID, 
                    APPWRITE_CONFIG.COLLECTION_USERS, 
                    userId, 
                    { status: 'blocked' }
                );
            } else {
                await databases.deleteDocument(
                    APPWRITE_CONFIG.DATABASE_ID, 
                    APPWRITE_CONFIG.COLLECTION_USERS, 
                    userId
                );
            }
            fetchAdminData();
        } catch (e) {
            console.error("Action error", e);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 p-8 space-y-8">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Admin Command Center</h1>
                    <p className="text-slate-400">Zero-Trust System Moderation</p>
                </div>
                <div className="px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg flex items-center gap-2 text-sm font-bold">
                    <ShieldAlert className="w-4 h-4" /> SECURE ADMIN SESSION
                </div>
            </header>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                    { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'text-primary-400' },
                    { label: 'Encrypted Messages', value: stats.totalMessages, icon: Activity, color: 'text-green-400' },
                    { label: 'Pending Reports', value: stats.pendingReports, icon: AlertTriangle, color: 'text-orange-400' },
                ].map((stat, i) => (
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                        key={i} className="glass p-6 rounded-2xl border border-white/5 space-y-2"
                    >
                        <stat.icon className={`w-6 h-6 ${stat.color}`} />
                        <div className="text-2xl font-bold">{stat.value}</div>
                        <div className="text-sm text-slate-500">{stat.label}</div>
                    </motion.div>
                ))}
            </div>

            {/* User Management */}
            <section className="glass rounded-2xl border border-white/5 overflow-hidden">
                <div className="p-6 border-b border-white/5 flex items-center justify-between">
                    <h2 className="font-bold flex items-center gap-2">
                        <Users className="w-5 h-5 text-primary-400" /> User Directory
                    </h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-white/5 text-slate-400 uppercase text-[10px] tracking-widest font-bold">
                            <tr>
                                <th className="px-6 py-4">User</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Role</th>
                                <th className="px-6 py-4">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {users.map((u) => (
                                <tr key={u.$id} className="hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center text-xs font-bold">
                                                {u.username[0].toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="font-medium text-slate-200">{u.username}</div>
                                                <div className="text-xs text-slate-500">{u.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${u.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                            {u.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-slate-400">{u.role}</td>
                                    <td className="px-6 py-4 flex gap-2">
                                        <button onClick={() => handleAction(u.$id, 'block')} className="p-2 hover:bg-orange-500/10 text-slate-500 hover:text-orange-500 rounded-lg transition-all" title="Block User">
                                            <Ban className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => handleAction(u.$id, 'delete')} className="p-2 hover:bg-red-500/10 text-slate-500 hover:text-red-500 rounded-lg transition-all" title="Delete User">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Reports Panel */}
            <section className="glass rounded-2xl border border-white/5 overflow-hidden">
                <div className="p-6 border-b border-white/5">
                    <h2 className="font-bold flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-orange-400" /> User Reports
                    </h2>
                </div>
                <div className="p-6 space-y-4">
                    {reports.length === 0 ? (
                        <div className="text-center py-8 text-slate-500 flex flex-col items-center gap-2">
                            <CheckCircle className="w-8 h-8 opacity-20" />
                            No pending reports. The system is clean.
                        </div>
                    ) : (
                        reports.map(r => (
                            <div key={r.$id} className="p-4 bg-white/5 rounded-xl border border-white/5 flex items-center justify-between">
                                <div>
                                    <div className="font-bold text-red-400 text-xs">Reason: {r.reason}</div>
                                    <div className="text-xs text-slate-400">Reporter ID: {r.reporter_id} | Target ID: {r.reported_user_id}</div>
                                </div>
                                <div className="flex gap-2">
                                    <button className="px-3 py-1 bg-primary-600 text-xs rounded-md">Resolve</button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </section>
        </div>
    );
};
