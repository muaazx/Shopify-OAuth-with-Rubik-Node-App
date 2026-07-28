import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Sparkles, ArrowRight, Loader2, CheckCircle, Store } from 'lucide-react';

export default function FunctionsPage() {
  const [searchParams] = useSearchParams();
  const shop = searchParams.get('shop');
  
  const [isEmbedding, setIsEmbedding] = useState(false);
  const [embedSuccess, setEmbedSuccess] = useState(false);
  
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  const [createAgentSuccess, setCreateAgentSuccess] = useState(false);

  const [storeName, setStoreName] = useState('');

  useEffect(() => {
    if (shop) {
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
        })
        .catch(console.error);
    }
  }, [shop]);

  const handleToggleWidget = async () => {
    if (!shop || !createAgentSuccess) return;
    
    const targetState = !embedSuccess;
    setIsEmbedding(true);
    
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const res = await fetch(`${backendUrl}/api/shopify/embed-widget`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop, enabled: targetState }),
      });
      
      const data = await res.json();
      if (res.ok && data.success) {
        setEmbedSuccess(data.enabled);
      } else {
        alert(data.error || 'Failed to toggle widget');
      }
    } catch (err) {
      alert('Network error while toggling widget');
    } finally {
      setIsEmbedding(false);
    }
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
      } else {
        alert(data.error || 'Failed to create agent');
      }
    } catch (err) {
      alert('Network error while creating agent');
    } finally {
      setIsCreatingAgent(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12 relative font-sans">
      <div className="relative z-10 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">Enable Functions</h1>
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

        <div className="max-w-xl mx-auto">
          {/* Create Agent Card */}
          <div className={`bg-white border ${createAgentSuccess ? 'border-emerald-500' : 'border-slate-200 hover:border-slate-300'} rounded-2xl shadow-sm p-6 transition-all duration-300 group`}>
            <div className="flex items-start justify-between mb-6">
              <div className={`p-3 rounded-2xl border ${createAgentSuccess ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                {isCreatingAgent ? (
                  <Loader2 className="w-6 h-6 text-slate-900 animate-spin" />
                ) : createAgentSuccess ? (
                  <CheckCircle className="w-6 h-6 text-emerald-600" />
                ) : (
                  <Sparkles className="w-6 h-6 text-slate-900" />
                )}
              </div>
            </div>
            
            <h3 className="text-xl font-semibold text-slate-900 mb-2">
              {createAgentSuccess ? 'Agent Created Successfully!' : 'Create AI Agent'}
            </h3>
            <p className="text-slate-500 text-sm mb-8 leading-relaxed h-10">
              {createAgentSuccess 
                ? 'Your AI Agent has been created on RubikChat.' 
                : 'Instantly create your AI Agent using your Shopify store details.'}
            </p>
            
            <div className="flex flex-col space-y-4">
              <button
                onClick={handleCreateAgent}
                disabled={isCreatingAgent || createAgentSuccess}
                className={`w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl font-medium transition-all ${
                  createAgentSuccess 
                    ? 'bg-emerald-50 text-emerald-700 cursor-default border border-emerald-200'
                    : 'bg-slate-900 hover:bg-black text-white shadow-sm disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed'
                }`}
              >
                {isCreatingAgent ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : createAgentSuccess ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>Agent Created</span>
                  </>
                ) : (
                  <>
                    <span>Create Agent</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>

              {/* Widget Embed Toggle Switch */}
              <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-2">
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-slate-900">Embed Chat Widget</span>
                  <span className="text-xs text-slate-500 mt-0.5">Show floating AI widget on storefront</span>
                </div>
                <button
                  onClick={handleToggleWidget}
                  disabled={!createAgentSuccess || isEmbedding}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    !createAgentSuccess ? 'opacity-50 cursor-not-allowed bg-slate-200' :
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
          </div>
        </div>
      </div>
    </div>
  );
}
