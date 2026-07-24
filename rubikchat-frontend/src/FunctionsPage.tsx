import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight, Loader2, CheckCircle, ArrowLeft, Store } from 'lucide-react';

export default function FunctionsPage() {
  const [searchParams] = useSearchParams();
  const shop = searchParams.get('shop');
  const navigate = useNavigate();
  
  const [isEmbedding, setIsEmbedding] = useState(false);
  const [embedSuccess, setEmbedSuccess] = useState(false);
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
        })
        .catch(console.error);
    }
  }, [shop]);

  const handleEmbedWidget = async () => {
    if (!shop) return;
    
    setIsEmbedding(true);
    setEmbedSuccess(false);
    
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const res = await fetch(`${backendUrl}/api/shopify/embed-widget`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop }),
      });
      
      const data = await res.json();
      if (res.ok && data.success) {
        setEmbedSuccess(true);
      } else {
        alert(data.error || 'Failed to embed widget');
      }
    } catch (err) {
      alert('Network error while embedding widget');
    } finally {
      setIsEmbedding(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12 relative font-sans">
      <div className="relative z-10 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <button 
              onClick={() => navigate('/')} 
              className="p-2 bg-white hover:bg-slate-100 rounded-xl transition-colors border border-slate-200 shadow-sm"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
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

        <div className="grid gap-6 md:grid-cols-2">
          {/* Embed Widget Card */}
          <div className={`bg-white border ${embedSuccess ? 'border-emerald-500' : 'border-slate-200 hover:border-slate-300'} rounded-2xl shadow-sm p-6 transition-all duration-300 group`}>
            <div className="flex items-start justify-between mb-6">
              <div className={`p-3 rounded-2xl border ${embedSuccess ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                {isEmbedding ? (
                  <Loader2 className="w-6 h-6 text-slate-900 animate-spin" />
                ) : embedSuccess ? (
                  <CheckCircle className="w-6 h-6 text-emerald-600" />
                ) : (
                  <Sparkles className="w-6 h-6 text-slate-900" />
                )}
              </div>
            </div>
            
            <h3 className="text-xl font-semibold text-slate-900 mb-2">
              {embedSuccess ? 'Widget Embedded Successfully!' : 'Embed RubikChat Agent'}
            </h3>
            <p className="text-slate-500 text-sm mb-8 leading-relaxed h-10">
              {embedSuccess 
                ? 'The AI chat widget is now live on your storefront.' 
                : 'Add the floating AI chat widget to your Shopify storefront to assist customers.'}
            </p>
            
            <button
              onClick={handleEmbedWidget}
              disabled={isEmbedding || embedSuccess}
              className={`w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl font-medium transition-all ${
                embedSuccess 
                  ? 'bg-emerald-50 text-emerald-700 cursor-default border border-emerald-200'
                  : 'bg-slate-900 hover:bg-black text-white shadow-sm disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed'
              }`}
            >
              {isEmbedding ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Embedding...</span>
                </>
              ) : embedSuccess ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>Enabled</span>
                </>
              ) : (
                <>
                  <span>Enable Function</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </div>
          
          {/* Placeholder for future functions */}
          <div className="bg-slate-50 border border-slate-200 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center">
            <div className="p-4 bg-white border border-slate-100 rounded-full mb-4 shadow-sm">
              <Sparkles className="w-5 h-5 text-slate-400" />
            </div>
            <h3 className="text-slate-700 font-medium mb-1">More Functions Coming Soon</h3>
            <p className="text-slate-500 text-sm">Custom MCP functions will appear here.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
