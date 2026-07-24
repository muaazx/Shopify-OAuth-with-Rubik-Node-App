import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight, Loader2, CheckCircle, ArrowLeft } from 'lucide-react';

export default function FunctionsPage() {
  const [searchParams] = useSearchParams();
  const shop = searchParams.get('shop');
  const navigate = useNavigate();
  
  const [isEmbedding, setIsEmbedding] = useState(false);
  const [embedSuccess, setEmbedSuccess] = useState(false);

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
    <div className="min-h-screen bg-slate-950 p-6 md:p-12 relative overflow-hidden font-sans">
      {/* Animated Background Blobs */}
      <div className="fixed top-0 -left-4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
      <div className="fixed top-0 -right-4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
      <div className="fixed -bottom-8 left-20 w-96 h-96 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>

      <div className="relative z-10 max-w-4xl mx-auto">
        <div className="flex items-center space-x-4 mb-8">
          <button 
            onClick={() => navigate('/')} 
            className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors border border-white/10"
          >
            <ArrowLeft className="w-5 h-5 text-slate-300" />
          </button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Enable Functions</h1>
            <p className="text-slate-400 mt-1">Select the functions you want to enable for {shop || 'your store'}.</p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Embed Widget Card */}
          <div className={`backdrop-blur-xl bg-white/10 border ${embedSuccess ? 'border-green-500/50' : 'border-white/20'} rounded-3xl shadow-xl p-6 transition-all duration-300 hover:bg-white/[0.12] hover:border-purple-500/50 group`}>
            <div className="flex items-start justify-between mb-6">
              <div className={`p-3 rounded-2xl ${embedSuccess ? 'bg-green-500/20' : 'bg-purple-500/20'}`}>
                {isEmbedding ? (
                  <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
                ) : embedSuccess ? (
                  <CheckCircle className="w-8 h-8 text-green-400" />
                ) : (
                  <Sparkles className="w-8 h-8 text-purple-400" />
                )}
              </div>
            </div>
            
            <h3 className="text-xl font-semibold text-white mb-2">
              {embedSuccess ? 'Widget Embedded Successfully!' : 'Embed RubikChat Agent'}
            </h3>
            <p className="text-slate-400 text-sm mb-8 leading-relaxed h-10">
              {embedSuccess 
                ? 'The AI chat widget is now live on your storefront.' 
                : 'Add the floating AI chat widget to your Shopify storefront to assist customers.'}
            </p>
            
            <button
              onClick={handleEmbedWidget}
              disabled={isEmbedding || embedSuccess}
              className={`w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl font-medium transition-all ${
                embedSuccess 
                  ? 'bg-green-500/20 text-green-400 cursor-default'
                  : 'bg-white/10 hover:bg-purple-500/80 text-white shadow-lg shadow-purple-500/20'
              }`}
            >
              {isEmbedding ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Embedding...</span>
                </>
              ) : embedSuccess ? (
                <>
                  <CheckCircle className="w-5 h-5" />
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
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col items-center justify-center text-center border-dashed">
            <div className="p-4 bg-white/5 rounded-full mb-4">
              <Sparkles className="w-6 h-6 text-slate-500" />
            </div>
            <h3 className="text-slate-300 font-medium mb-1">More Functions Coming Soon</h3>
            <p className="text-slate-500 text-sm">Custom MCP functions will appear here.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
