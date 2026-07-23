import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Store, CheckCircle, XCircle, Sparkles, ArrowRight, Mail, Loader2, ExternalLink } from 'lucide-react';

function App() {
  const [shopUrl, setShopUrl] = useState('');
  const [email, setEmail] = useState('');
  const [searchParams] = useSearchParams();
  
  // App states: idle -> connecting_shopify -> shopify_success -> setting_up_rubikchat -> complete
  const [status, setStatus] = useState<'idle' | 'shopify_success' | 'setting_up_rubikchat' | 'complete' | 'error' | 'checking'>('idle');
  const [connectedShop, setConnectedShop] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isHovered, setIsHovered] = useState(false);

  const isEmbedded = searchParams.get('embedded') === '1' || window.self !== window.top;
  const initialShop = searchParams.get('shop');

  useEffect(() => {
    const urlStatus = searchParams.get('status');

    if (isEmbedded && initialShop) {
      // If we are inside the Shopify Admin iframe, we want to immediately check connection status
      setStatus('checking');
      setConnectedShop(initialShop);
      checkStatus(initialShop, true);
    } else if (urlStatus === 'success' && initialShop) {
      setConnectedShop(initialShop);
      checkStatus(initialShop, false);
    } else if (urlStatus === 'error') {
      setStatus('error');
      setErrorMessage('We couldn\'t connect your store. Please double-check your URL and try again.');
    } else if (initialShop) {
      setShopUrl(initialShop);
    }
  }, [searchParams, isEmbedded, initialShop]);

  const checkStatus = async (shop: string, embeddedMode: boolean) => {
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const res = await fetch(`${backendUrl}/api/status?shop=${shop}`);
      const data = await res.json();
      
      if (data.shopifyConnected && data.rubikchatConnected) {
        setStatus('complete');
      } else if (data.shopifyConnected && !embeddedMode) {
        setStatus('shopify_success');
      } else if (!data.shopifyConnected && !data.rubikchatConnected && embeddedMode) {
        setStatus('idle');
      } else {
        setStatus('idle');
      }
    } catch (err) {
      setStatus('error');
      setErrorMessage('Failed to verify connection status.');
    }
  };

  const handleConnectShopify = () => {
    if (!shopUrl) return;
    
    let domain = shopUrl.trim();
    if (!domain.includes('.myshopify.com')) {
      domain = `${domain}.myshopify.com`;
    }
    
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
    window.location.href = `${backendUrl}/api/auth/shopify?shop=${domain}`;
  };

  const handleSetupRubikchat = async () => {
    if (!email || !connectedShop) return;
    
    setStatus('setting_up_rubikchat');
    
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const res = await fetch(`${backendUrl}/api/rubikchat/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop: connectedShop, email }),
      });
      
      const data = await res.json();
      if (res.ok && data.success) {
        setStatus('complete');
      } else {
        setStatus('error');
        setErrorMessage(data.error || 'Failed to setup RubikChat');
      }
    } catch (err) {
      setStatus('error');
      setErrorMessage('Network error while setting up RubikChat');
    }
  };

  const handleOpenStandalone = () => {
    // Break out of iframe to do the full standalone connection process
    window.open(window.location.origin + '?shop=' + connectedShop, '_blank');
  };

  // ==========================================
  // EMBEDDED UI (Inside Shopify Admin)
  // ==========================================
  if (isEmbedded) {
    return (
      <div className="min-h-screen bg-[#f4f6f8] p-8 font-sans">
        <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-sm border border-[#e1e3e5] p-8">
          <div className="flex items-center space-x-4 mb-6 pb-6 border-b border-[#e1e3e5]">
            <div className="bg-gradient-to-tr from-blue-500 to-purple-500 w-12 h-12 rounded-lg flex items-center justify-center shadow-md">
              <Store className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-[#202223]">RubikChat Setup</h1>
              <p className="text-[#6d7175]">AI Agents for Customer Support & Sales</p>
            </div>
          </div>

          {status === 'checking' && (
            <div className="flex items-center space-x-3 text-[#6d7175]">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Checking connection status...</span>
            </div>
          )}

          {status === 'complete' && (
            <div className="bg-[#e3f1df] border border-[#aee9d1] rounded-lg p-5 flex items-start space-x-4">
              <div className="bg-[#00a47c] p-1.5 rounded-full mt-0.5">
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-[#202223] font-semibold text-lg">Successfully Connected</h3>
                <p className="text-[#6d7175] mt-1">
                  Your store <strong>{connectedShop}</strong> is fully integrated with RubikChat AI.
                </p>
              </div>
            </div>
          )}

          {status === 'idle' && (
            <div className="text-center py-8">
              <h2 className="text-lg font-semibold text-[#202223] mb-2">Action Required</h2>
              <p className="text-[#6d7175] mb-6 max-w-sm mx-auto">
                To enable your AI agents, you need to connect your Shopify store to your RubikChat account securely.
              </p>
              <button 
                onClick={handleOpenStandalone}
                className="inline-flex items-center space-x-2 bg-[#2c6ecb] hover:bg-[#1f5199] text-white font-medium px-6 py-2.5 rounded-md shadow-sm transition-colors"
              >
                <span>Connect with RubikChat</span>
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==========================================
  // STANDALONE UI (Vercel full screen)
  // ==========================================
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Animated Background Blobs */}
      <div className="absolute top-0 -left-4 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-2xl opacity-20 animate-blob"></div>
      <div className="absolute top-0 -right-4 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-2xl opacity-20 animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-8 left-20 w-72 h-72 bg-indigo-500 rounded-full mix-blend-multiply filter blur-2xl opacity-20 animate-blob animation-delay-4000"></div>

      <div className="relative z-10 max-w-md w-full">
        {/* Glassmorphism Card */}
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl shadow-2xl p-8 space-y-8 transition-all duration-500 hover:bg-white/[0.12] hover:border-white/30 hover:shadow-blue-900/50">
          
          <div className="text-center space-y-4">
            <div className="mx-auto bg-gradient-to-tr from-blue-500 to-purple-500 w-20 h-20 rounded-2xl flex items-center justify-center mb-6 shadow-lg transform transition-transform duration-500 hover:rotate-12 hover:scale-110">
              <Store className="w-10 h-10 text-white" strokeWidth={1.5} />
            </div>
            
            <h1 className="text-4xl font-bold tracking-tight">
              <span className="text-white">Connect</span>{' '}
              <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Shopify</span>
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed max-w-xs mx-auto">
              Supercharge your ecommerce store with RubikChat's intelligent AI support agents.
            </p>
          </div>

          {status === 'complete' && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-5 flex items-start space-x-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-green-500/20 p-2 rounded-full flex-shrink-0">
                <CheckCircle className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <h3 className="text-green-400 font-semibold text-lg">Setup Complete!</h3>
                <p className="text-green-300/80 text-sm mt-1">
                  Your store <strong className="text-green-200">{connectedShop}</strong> and RubikChat AI are fully integrated. You are ready to go!
                </p>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 flex items-start space-x-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-red-500/20 p-2 rounded-full flex-shrink-0">
                <XCircle className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h3 className="text-red-400 font-semibold text-lg">Connection Failed</h3>
                <p className="text-red-300/80 text-sm mt-1">
                  {errorMessage}
                </p>
                <button onClick={() => setStatus('idle')} className="mt-3 text-red-400 text-xs font-semibold hover:underline">Try Again</button>
              </div>
            </div>
          )}

          {status === 'shopify_success' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4 flex items-center space-x-3 mb-2">
                 <CheckCircle className="w-5 h-5 text-blue-400 flex-shrink-0" />
                 <span className="text-blue-300 text-sm font-medium">Shopify Connected Successfully!</span>
              </div>
              
              <div className="space-y-2">
                <label htmlFor="email" className="block text-sm font-medium text-slate-300 ml-1 flex items-center space-x-2">
                  <Mail className="w-4 h-4 text-purple-400" />
                  <span>Enter your Email to finalize AI setup</span>
                </label>
                <div className="relative group">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl blur opacity-30 group-hover:opacity-60 transition duration-500"></div>
                  <div className="relative flex items-center">
                    <input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="w-full pl-5 pr-5 py-4 bg-slate-900/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-300"
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={handleSetupRubikchat}
                disabled={!email}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                className="group relative w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:from-slate-700 disabled:to-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-xl shadow-lg transition-all duration-300 overflow-hidden"
              >
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out"></div>
                <span className="relative z-10 flex items-center space-x-2">
                  <span>Complete Setup</span>
                  <ArrowRight className={`w-5 h-5 transition-transform duration-300 ${isHovered && email ? 'translate-x-1' : ''}`} />
                </span>
              </button>
            </div>
          )}

          {status === 'setting_up_rubikchat' && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4 animate-in fade-in duration-500">
               <Loader2 className="w-12 h-12 text-purple-400 animate-spin" />
               <p className="text-purple-300 font-medium">Configuring RubikChat AI...</p>
            </div>
          )}

          {(status === 'idle' || status === 'checking') && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-2">
                <label htmlFor="shop" className="block text-sm font-medium text-slate-300 ml-1 flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span>Store Domain</span>
                </label>
                <div className="relative group">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl blur opacity-30 group-hover:opacity-60 transition duration-500"></div>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      id="shop"
                      value={shopUrl}
                      onChange={(e) => setShopUrl(e.target.value)}
                      placeholder="your-store-name"
                      className="w-full pl-5 pr-36 py-4 bg-slate-900/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-300"
                    />
                    <div className="absolute right-4 text-slate-500 font-medium pointer-events-none">
                      .myshopify.com
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={handleConnectShopify}
                disabled={!shopUrl}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                className="group relative w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:from-slate-700 disabled:to-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-xl shadow-lg transition-all duration-300 overflow-hidden"
              >
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out"></div>
                <span className="relative z-10 flex items-center space-x-2">
                  <span>Connect Store</span>
                  <ArrowRight className={`w-5 h-5 transition-transform duration-300 ${isHovered && shopUrl ? 'translate-x-1' : ''}`} />
                </span>
              </button>
            </div>
          )}

        </div>
        
        {/* Footer branding */}
        <div className="mt-8 flex items-center justify-center space-x-2 opacity-60 hover:opacity-100 transition-opacity duration-300 cursor-default">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></div>
          <span className="text-slate-400 text-sm font-medium tracking-wide">
            Secured by RubikChat OAuth 2.0
          </span>
        </div>
      </div>
    </div>
  );
}

export default App;
