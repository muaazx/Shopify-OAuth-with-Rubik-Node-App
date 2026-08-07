import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Sparkles, ArrowRight, Loader2, CheckCircle, Store, X } from 'lucide-react';

export default function FunctionsPage() {
  const [searchParams] = useSearchParams();
  const shop = searchParams.get('shop');
  const token = searchParams.get('token');
  const agentJustCreated = searchParams.get('agentCreated') === '1';

  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [isEmbedding, setIsEmbedding] = useState<boolean>(false);
  const [embedSuccess, setEmbedSuccess] = useState<boolean>(false);
  const [isCreatingAgent, setIsCreatingAgent] = useState<boolean>(false);
  const [createAgentSuccess, setCreateAgentSuccess] = useState<boolean>(agentJustCreated);
  const [storeName, setStoreName] = useState<string>('');
  const [showSuccessBanner, setShowSuccessBanner] = useState<boolean>(agentJustCreated);
  const [actions, setActions] = useState<Array<{ name: string; action_slug: string; description: string; status: boolean }>>([]);
  const [togglingActionSlug, setTogglingActionSlug] = useState<string | null>(null);

  // Clean up the agentCreated param from URL after reading it
  useEffect(() => {
    if (agentJustCreated && shop && window.history.replaceState) {
      const cleanUrl = window.location.pathname + '?shop=' + encodeURIComponent(shop);
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }, [agentJustCreated, shop]);

  // Auto-dismiss the success banner after 8 seconds
  useEffect(() => {
    if (showSuccessBanner) {
      const timer = setTimeout(() => setShowSuccessBanner(false), 8000);
      return () => clearTimeout(timer);
    }
  }, [showSuccessBanner]);

  useEffect(() => {
    if (!shop) {
      setIsAuthorized(false);
      return;
    }

    const storedToken = typeof window !== 'undefined' ? localStorage.getItem('rubik_auth_token') : null;
    const payload: Record<string, any> = { shop };
    if (token) payload.token = token;
    if (storedToken) payload.authToken = storedToken;

    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
    fetch(`${backendUrl}/api/verify-oauth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    })
      .then(res => res.json())
      .then(data => {
        if (data && data.success) {
          setIsAuthorized(true);
          if (token && window.history.replaceState) {
            window.history.replaceState({}, document.title, window.location.pathname + '?shop=' + encodeURIComponent(shop));
          }
        } else {
          setIsAuthorized(false);
        }
      })
      .catch(() => setIsAuthorized(false));
  }, [shop, token]);

  useEffect(() => {
    if (shop && isAuthorized) {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      fetch(`${backendUrl}/api/status?shop=${shop}`)
        .then(res => res.json())
        .then(data => {
          if (data.shopDetails?.store_name) {
            setStoreName(data.shopDetails.store_name);
          }
          if (data.widgetEmbedded) {
            setEmbedSuccess(true);
          }
          if (data.agentCreated) {
            setCreateAgentSuccess(true);
          }
          if (data.actions) {
            setActions(data.actions);
          }
        })
        .catch(console.error);
    }
  }, [shop, isAuthorized]);

  const handleToggleWidget = async () => {
    if (!shop || !createAgentSuccess) return;
    
    const targetState = !embedSuccess;
    setIsEmbedding(true);
    
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'https://rubik-chat-lead-gen-node-server-backend-production-0f28.up.railway.app';
      const res = await fetch(`${backendUrl}/api/shopify/toggle-widget`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop, enabled: targetState }),
      });
      
      const data = await res.json();
      if (res.ok && data.success) {
        setEmbedSuccess(data.enabled);
      } else {
        console.error('Failed to toggle widget preference:', data.error);
      }
    } catch (err) {
      console.error('Network error while toggling widget preference:', err);
    } finally {
      setIsEmbedding(false);
    }
  };

  const handleToggleAction = async (actionSlug: string, currentStatus: boolean) => {
    if (!shop || !createAgentSuccess) return;
    
    setTogglingActionSlug(actionSlug);
    
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'https://rubik-chat-lead-gen-node-server-backend-production-0f28.up.railway.app';
      const res = await fetch(`${backendUrl}/api/shopify/toggle-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop,
          action_slug: actionSlug,
          status: !currentStatus
        }),
      });
      
      const data = await res.json();
      if (res.ok && data.success) {
        setActions(prev => prev.map(act => 
          act.action_slug === actionSlug ? { ...act, status: !currentStatus } : act
        ));
      } else {
        console.error('Failed to toggle action status:', data.error);
        alert(data.error || 'Failed to toggle function status');
      }
    } catch (err) {
      console.error('Network error while toggling action:', err);
      alert('Network error while toggling function status');
    } finally {
      setTogglingActionSlug(null);
    }
  };

  const getDisplayDescription = (name: string) => {
    const nameLower = name.toLowerCase();
    if (nameLower.includes('product')) {
      return "Allows AI agent to browse store catalog, pricing, and product variants.";
    }
    if (nameLower.includes('order')) {
      return "Allows AI agent to look up order tracking, status, and fulfillment state.";
    }
    if (nameLower.includes('cart') || nameLower.includes('checkout')) {
      return "Allows AI agent to generate multi-item cart checkout links for customers.";
    }
    return "";
  };

  const handleCreateAgent = async () => {
    if (!shop) return;
    
    setIsCreatingAgent(true);
    setCreateAgentSuccess(false);
    
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const res = await fetch(`${backendUrl}/api/rubikchat/create-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop }),
      });
      
      const data = await res.json();
      if (res.ok && data.success) {
        setCreateAgentSuccess(true);
        if (window.opener) {
          window.opener.postMessage({ type: 'RUBIKCHAT_CONNECTED' }, '*');
        }
        try {
          const channel = new BroadcastChannel('rubikchat_oauth_channel');
          channel.postMessage({ type: 'RUBIKCHAT_CONNECTED' });
          channel.close();
        } catch (e) {
          console.error(e);
        }

      } else {
        alert(data.error || 'Failed to create agent');
      }
    } catch (err) {
      alert('Network error while creating agent');
    } finally {
      setIsCreatingAgent(false);
    }
  };

  if (isAuthorized === null) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
        <div className="flex items-center space-x-3 text-slate-600 font-medium">
          <Loader2 className="w-6 h-6 animate-spin text-slate-900" />
          <span>Verifying session authorization...</span>
        </div>
      </div>
    );
  }

  if (isAuthorized === false) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
        <div className="bg-white border border-red-200 rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-sm">
          <div className="mx-auto bg-red-100 w-12 h-12 rounded-full flex items-center justify-center">
            <span className="text-red-600 font-bold text-xl">✕</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Access Denied</h1>
          <p className="text-slate-500 text-sm leading-relaxed">
            Invalid, expired, or unauthenticated session link. Please connect directly from your Shopify Admin dashboard.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12 relative font-sans">
      <div className="relative z-10 max-w-4xl mx-auto">
        {/* Success Banner — shown when redirected after agent creation */}
        {showSuccessBanner && (
          <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex items-center space-x-3">
              <div className="bg-emerald-100 p-1.5 rounded-full flex-shrink-0">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <span className="text-emerald-900 font-semibold text-sm">Your Agent Created Successfully!</span>
                <p className="text-emerald-700 text-xs mt-0.5">Your AI agent is live and ready to assist your customers.</p>
              </div>
            </div>
            <button
              onClick={() => setShowSuccessBanner(false)}
              className="text-emerald-600 hover:text-emerald-800 p-1 rounded-md hover:bg-emerald-100 transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 font-sans">Manage Agent Functions</h1>
              <p className="text-slate-500 mt-1">Select the functions you want to enable.</p>
            </div>
          </div>
          
          <div className="hidden md:flex items-center space-x-3 bg-white border border-slate-200 rounded-xl px-4 py-2 shadow-sm">
            <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center border border-slate-200">
               <Store className="w-4 h-4 text-slate-700" />
            </div>
            <div className="flex flex-col pr-2">
              <span className="text-sm font-semibold text-slate-900">{storeName || shop || 'Connected Store'}</span>
              <span className="text-xs font-medium text-emerald-600 flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Connected
              </span>
            </div>
          </div>
        </div>

        <div className="w-full">
          {!createAgentSuccess ? (
            <div className="max-w-md mx-auto">
              {/* Create Agent Card — only show create button if agent not yet created */}
              <div className="bg-white border border-slate-200 hover:border-slate-300 rounded-2xl shadow-sm p-6 transition-all duration-300 group">
                <div className="flex items-start justify-between mb-6">
                  <div className="p-3 rounded-2xl border bg-slate-50 border-slate-100">
                    {isCreatingAgent ? (
                      <Loader2 className="w-6 h-6 text-slate-900 animate-spin" />
                    ) : (
                      <Sparkles className="w-6 h-6 text-slate-900" />
                    )}
                  </div>
                </div>
                
                <h3 className="text-xl font-semibold text-slate-900 mb-2">Create AI Agent</h3>
                <p className="text-slate-500 text-sm mb-8 leading-relaxed h-10">
                  Instantly create your AI Agent using your Shopify store details.
                </p>
                
                <button
                  onClick={handleCreateAgent}
                  disabled={isCreatingAgent}
                  className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl font-medium transition-all bg-slate-900 hover:bg-black text-white shadow-sm disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
                >
                  {isCreatingAgent ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <span>Create Agent</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl w-full mx-auto">
              {/* Card 1: RubikChat Widget */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 flex flex-col justify-between h-40 hover:border-slate-300 transition-all duration-200">
                <div className="flex items-start justify-between h-full">
                  <div className="flex flex-col pr-4 justify-between h-full">
                    <div>
                      <span className="text-sm font-semibold text-slate-900 block">RubikChat Widget</span>
                      <span className="text-xs text-slate-500 mt-2 block leading-relaxed max-w-xs">
                        Show floating AI chat widget on storefront.
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={handleToggleWidget}
                    disabled={isEmbedding}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      embedSuccess ? 'bg-indigo-600' : 'bg-slate-200'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        embedSuccess ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* MCP Action Cards */}
              {actions.map((act) => (
                <div key={act.action_slug} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 flex flex-col justify-between h-40 hover:border-slate-300 transition-all duration-200">
                  <div className="flex items-start justify-between h-full">
                    <div className="flex flex-col pr-4 justify-between h-full">
                      <div>
                        <span className="text-sm font-semibold text-slate-900 block">{act.name}</span>
                        <span className="text-xs text-slate-500 mt-2 block leading-relaxed max-w-xs">
                          {getDisplayDescription(act.name)}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggleAction(act.action_slug, act.status)}
                      disabled={togglingActionSlug !== null}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        act.status ? 'bg-indigo-600' : 'bg-slate-200'
                      } ${togglingActionSlug !== null ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          act.status ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
