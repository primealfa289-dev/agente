import React, { useState, useEffect } from "react";
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  onAuthStateChanged, 
  collection, 
  doc, 
  setDoc, 
  onSnapshot, 
  query, 
  where, 
  addDoc, 
  deleteDoc, 
  Timestamp,
  User,
  OperationType,
  handleFirestoreError
} from "./firebase";
import { 
  QrCode, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Plus, 
  Trash2, 
  LogOut, 
  UserPlus, 
  MessageSquare, 
  Settings,
  Smartphone,
  ShieldCheck
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [wsStatus, setWsStatus] = useState<"connecting" | "open" | "close" | "qr" | "pairing">("connecting");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingPhone, setPairingPhone] = useState("");
  const [isRequestingPairing, setIsRequestingPairing] = useState(false);
  const [connectMethod, setConnectMethod] = useState<"qr" | "number">("qr");
  const [contacts, setContacts] = useState<any[]>([]);
  const [newContact, setNewContact] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Listen to automated contacts
    const q = query(collection(db, "automated_contacts"), where("createdBy", "==", user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const contactList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setContacts(contactList);
      
      // Sync with backend
      syncWithBackend(contactList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "automated_contacts");
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/status");
        const data = await res.json();
        setWsStatus(data.status);
        setQrCode(data.qr);
        setPairingCode(data.pairingCode);
      } catch (e) {
        console.error("Error fetching status:", e);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const syncWithBackend = async (contactList: any[]) => {
    try {
      setIsSyncing(true);
      await fetch("/api/contacts/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: contactList.map(c => c.phoneNumber) })
      });
    } catch (e) {
      console.error("Sync error:", e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRequestPairingCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pairingPhone) return;
    
    try {
      setIsRequestingPairing(true);
      const res = await fetch("/api/pairing-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: pairingPhone })
      });
      const data = await res.json();
      if (data.code) {
        setPairingCode(data.code);
        setWsStatus("pairing");
      }
    } catch (e) {
      console.error("Pairing code error:", e);
    } finally {
      setIsRequestingPairing(false);
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error("Login error:", e);
    }
  };

  const handleLogout = async () => {
    await auth.signOut();
  };

  const handleDisconnectWhatsapp = async () => {
    if (confirm("Tem certeza que deseja desconectar o WhatsApp?")) {
      await fetch("/api/logout", { method: "POST" });
      setPairingCode(null);
      setConnectMethod("qr");
    }
  };

  const addContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContact || !user) return;

    const cleanNumber = newContact.replace(/\D/g, "");
    if (cleanNumber.length < 8) {
      alert("Número inválido");
      return;
    }

    try {
      await addDoc(collection(db, "automated_contacts"), {
        phoneNumber: cleanNumber,
        addedAt: Timestamp.now(),
        createdBy: user.uid
      });
      setNewContact("");
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, "automated_contacts");
    }
  };

  const removeContact = async (id: string) => {
    try {
      await deleteDoc(doc(db, "automated_contacts", id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, "automated_contacts");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-8"
        >
          <div className="flex justify-center">
            <div className="w-20 h-20 bg-green-500/20 rounded-3xl flex items-center justify-center border border-green-500/30">
              <MessageSquare className="w-10 h-10 text-green-500" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tighter">WhatsApp AI Agent</h1>
            <p className="text-zinc-400">Automatize suas respostas 24/7 com inteligência artificial.</p>
          </div>
          <button 
            onClick={handleLogin}
            className="w-full bg-white text-black font-semibold py-4 rounded-2xl flex items-center justify-center gap-3 hover:bg-zinc-200 transition-colors"
          >
            <ShieldCheck className="w-5 h-5" />
            Entrar com Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-green-500/30">
      {/* Header */}
      <header className="border-b border-zinc-800/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center border border-green-500/30">
              <MessageSquare className="w-5 h-5 text-green-500" />
            </div>
            <span className="font-bold text-xl tracking-tight">AI Agent</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex flex-col items-end">
              <span className="text-sm font-medium">{user.displayName}</span>
              <span className="text-xs text-zinc-500">{user.email}</span>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-white"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* Left Column: Connection Status & QR */}
          <div className="lg:col-span-5 space-y-8">
            <section className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-8 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-zinc-400" />
                  Conexão
                </h2>
                <div className={cn(
                  "px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2",
                  wsStatus === "open" ? "bg-green-500/10 text-green-500" : "bg-zinc-800 text-zinc-400"
                )}>
                  <div className={cn("w-2 h-2 rounded-full", wsStatus === "open" ? "bg-green-500 animate-pulse" : "bg-zinc-600")} />
                  {wsStatus === "open" ? "Conectado" : wsStatus === "qr" ? "Aguardando QR" : wsStatus === "pairing" ? "Código de Pareamento" : "Desconectado"}
                </div>
              </div>

              {wsStatus === "open" ? (
                <div className="space-y-6 text-center py-8">
                  <div className="flex justify-center">
                    <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center border border-green-500/20">
                      <CheckCircle2 className="w-10 h-10 text-green-500" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-bold">WhatsApp Ativo</h3>
                    <p className="text-sm text-zinc-400">Seu agente está online e pronto para responder.</p>
                  </div>
                  <button 
                    onClick={handleDisconnectWhatsapp}
                    className="text-sm text-red-500 hover:text-red-400 font-medium transition-colors"
                  >
                    Desconectar Aparelho
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Connection Method Tabs */}
                  <div className="flex p-1 bg-zinc-800 rounded-xl">
                    <button 
                      onClick={() => setConnectMethod("qr")}
                      className={cn(
                        "flex-1 py-2 text-sm font-medium rounded-lg transition-all",
                        connectMethod === "qr" ? "bg-zinc-700 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"
                      )}
                    >
                      QR Code
                    </button>
                    <button 
                      onClick={() => setConnectMethod("number")}
                      className={cn(
                        "flex-1 py-2 text-sm font-medium rounded-lg transition-all",
                        connectMethod === "number" ? "bg-zinc-700 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"
                      )}
                    >
                      Número
                    </button>
                  </div>

                  {connectMethod === "qr" ? (
                    <div className="space-y-6">
                      {qrCode ? (
                        <div className="bg-white p-4 rounded-2xl flex items-center justify-center aspect-square">
                          <img src={qrCode} alt="WhatsApp QR Code" className="w-full h-full" />
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 space-y-4">
                          <Loader2 className="w-8 h-8 text-zinc-600 animate-spin" />
                          <p className="text-sm text-zinc-500">Gerando QR Code...</p>
                        </div>
                      )}
                      <p className="text-sm text-zinc-400 text-center">
                        Abra o WhatsApp no seu celular, vá em <span className="text-white font-medium">Aparelhos Conectados</span> e escaneie o código acima.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {pairingCode ? (
                        <div className="space-y-6">
                          <div className="bg-zinc-800 p-8 rounded-2xl text-center">
                            <span className="text-4xl font-mono font-bold tracking-[0.5em] text-green-500">
                              {pairingCode}
                            </span>
                          </div>
                          <p className="text-sm text-zinc-400 text-center">
                            No seu WhatsApp, vá em <span className="text-white font-medium">Aparelhos Conectados</span> {">"} <span className="text-white font-medium">Conectar com número de telefone</span> e digite o código acima.
                          </p>
                          <button 
                            onClick={() => { setPairingCode(null); setWsStatus("connecting"); }}
                            className="w-full text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                          >
                            Tentar outro número ou QR Code
                          </button>
                        </div>
                      ) : (
                        <form onSubmit={handleRequestPairingCode} className="space-y-4">
                          <div className="space-y-2">
                            <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Número do Telefone</label>
                            <input 
                              type="text" 
                              placeholder="Ex: 5511999999999"
                              value={pairingPhone}
                              onChange={(e) => setPairingPhone(e.target.value)}
                              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                            />
                          </div>
                          <button 
                            type="submit"
                            disabled={isRequestingPairing || !pairingPhone}
                            className="w-full bg-green-500 hover:bg-green-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-black font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                          >
                            {isRequestingPairing ? <Loader2 className="w-5 h-5 animate-spin" /> : "Gerar Código"}
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-8 space-y-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Settings className="w-5 h-5 text-zinc-400" />
                Configurações
              </h2>
              <p className="text-sm text-zinc-400">
                O agente responderá automaticamente a qualquer mensagem dos contatos na sua lista.
              </p>
              <div className="pt-4 flex items-center gap-2 text-xs text-zinc-500">
                <ShieldCheck className="w-4 h-4" />
                Segurança ponta-a-ponta ativa
              </div>
            </section>
          </div>

          {/* Right Column: Contacts Management */}
          <div className="lg:col-span-7 space-y-8">
            <section className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-8 space-y-8">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-zinc-400" />
                  Contatos Automatizados
                </h2>
                {isSyncing && <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />}
              </div>

              <form onSubmit={addContact} className="flex gap-3">
                <input 
                  type="text" 
                  placeholder="Número (ex: 5511999999999)"
                  value={newContact}
                  onChange={(e) => setNewContact(e.target.value)}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                />
                <button 
                  type="submit"
                  className="bg-green-500 hover:bg-green-400 text-black p-3 rounded-xl transition-colors"
                >
                  <Plus className="w-6 h-6" />
                </button>
              </form>

              <div className="space-y-3">
                <AnimatePresence mode="popLayout">
                  {contacts.length === 0 ? (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center py-12 border-2 border-dashed border-zinc-800 rounded-2xl"
                    >
                      <p className="text-zinc-500 text-sm">Nenhum contato adicionado ainda.</p>
                    </motion.div>
                  ) : (
                    contacts.map((contact) => (
                      <motion.div 
                        key={contact.id}
                        layout
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-zinc-800/50 border border-zinc-700/50 rounded-2xl p-4 flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-zinc-700 rounded-full flex items-center justify-center text-zinc-400">
                            {contact.phoneNumber.slice(-2)}
                          </div>
                          <div>
                            <p className="font-medium">+{contact.phoneNumber}</p>
                            <p className="text-xs text-zinc-500">Automatizado</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => removeContact(contact.id)}
                          className="p-2 text-zinc-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </section>
          </div>

        </div>
      </main>
    </div>
  );
}
