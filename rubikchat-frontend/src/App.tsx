import { useState, useEffect } from 'react';
import { useSearchParams, Routes, Route, useNavigate } from 'react-router-dom';
import { Store, CheckCircle, XCircle, Sparkles, ArrowRight, Mail, Loader2, ExternalLink } from 'lucide-react';
import FunctionsPage from './FunctionsPage';

function ConnectPage() {
  const [shopUrl, setShopUrl] = useState('');
  const [email, setEmail] = useState('');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // App states: idle -> connecting_shopify -> shopify_success -> setting_up_rubikchat -> complete
  const [status, setStatus] = useState<'idle' | 'connecting_shopify' | 'shopify_success' | 'setting_up_rubikchat' | 'complete' | 'error' | 'checking'>('idle');
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
      setStatus('checking');
      setConnectedShop(initialShop);
      checkStatus(initialShop, false);
    } else if (urlStatus === 'error') {
      setStatus('error');
      setErrorMessage('We couldn\'t connect your store. Please double-check your URL and try again.');
    } else if (initialShop) {
      setShopUrl(initialShop);
      setConnectedShop(initialShop);
      setStatus('checking');
      checkStatus(initialShop, false);
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
    
    setStatus('connecting_shopify');
    
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
    // Break out of iframe to the functions page
    window.open(window.location.origin + '/functions?shop=' + connectedShop, '_blank');
  };

  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect RubikChat from this shop? This will delete all integration configuration.')) {
      return;
    }
    
    setIsDisconnecting(true);
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const res = await fetch(`${backendUrl}/api/shopify/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop: connectedShop }),
      });
      
      const data = await res.json();
      if (res.ok && data.success) {
        setStatus('idle');
      } else {
        alert(data.error || 'Failed to disconnect');
      }
    } catch (err) {
      alert('Network error while disconnecting');
    } finally {
      setIsDisconnecting(false);
    }
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
            <div className="space-y-6">
              <div className="bg-[#e3f1df] border border-[#aee9d1] rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="bg-[#00a47c] p-1 rounded-full flex-shrink-0">
                    <CheckCircle className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-[#202223] font-medium">Successfully Connected</span>
                </div>
                <button
                  onClick={handleDisconnect}
                  disabled={isDisconnecting}
                  className="text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-50 px-3 py-1.5 hover:bg-[#d6ebd1] rounded-md transition-all"
                >
                  {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
                </button>
              </div>
              
              <div>
                <div className="grid gap-3 mt-4">
                  <button 
                    onClick={handleOpenStandalone}
                    className="flex items-center justify-between w-full p-4 bg-white border border-[#e1e3e5] hover:border-[#2c6ecb] hover:shadow-sm rounded-lg transition-all text-left group"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="bg-[#f4f6f8] p-2.5 rounded-md group-hover:bg-[#f0f4fb] transition-colors">
                        <Sparkles className="w-5 h-5 text-[#2c6ecb]" />
                      </div>
                      <div>
                        <h4 className="text-[#202223] font-medium">Enable Functions</h4>
                        <p className="text-[#6d7175] text-sm mt-0.5">Configure your AI agent and add features</p>
                      </div>
                    </div>
                    <ExternalLink className="w-5 h-5 text-[#6d7175] group-hover:text-[#2c6ecb] transition-all" />
                  </button>
                </div>
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
                onClick={() => window.open(window.location.origin + '?shop=' + connectedShop, '_blank')}
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
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 relative font-sans">
      <div className="relative z-10 max-w-md w-full">
        {/* Minimal White Card */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 space-y-8">
          
          <div className="text-center space-y-4">
            <div className="mx-auto bg-slate-100 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 shadow-sm border border-slate-200">
              <Store className="w-8 h-8 text-slate-900" strokeWidth={1.5} />
            </div>
            
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Connect Shopify
            </h1>
            <p className="text-slate-500 text-sm leading-relaxed max-w-xs mx-auto">
              Supercharge your ecommerce store with RubikChat's intelligent AI support agents.
            </p>
          </div>

          {status === 'complete' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 flex flex-col items-center justify-center text-center space-y-3">
                 <div className="bg-emerald-100 p-3 rounded-full">
                   <CheckCircle className="w-8 h-8 text-emerald-600" />
                 </div>
                 <div>
                   <h3 className="text-emerald-900 font-bold text-lg">Setup Complete!</h3>
                   <p className="text-emerald-700 text-sm mt-1">Your store is successfully connected.</p>
                 </div>
              </div>
              <button
                onClick={() => navigate('/functions?shop=' + connectedShop)}
                className="w-full flex items-center justify-center space-x-2 bg-slate-900 hover:bg-black text-white font-medium py-3.5 px-6 rounded-xl shadow-sm transition-all"
              >
                <span>Go to Functions Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="w-full flex items-center justify-center space-x-2 bg-white hover:bg-red-50 text-red-600 border border-red-200 font-medium py-2.5 px-6 rounded-xl transition-all disabled:opacity-50"
              >
                <span>{isDisconnecting ? 'Disconnecting...' : 'Disconnect Store'}</span>
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-start space-x-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-red-100 p-2 rounded-full flex-shrink-0">
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-red-900 font-semibold text-sm">Connection Failed</h3>
                <p className="text-red-700 text-sm mt-1">
                  {errorMessage}
                </p>
                <button onClick={() => setStatus('idle')} className="mt-3 text-red-600 text-xs font-semibold hover:underline">Try Again</button>
              </div>
            </div>
          )}

          {status === 'shopify_success' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center space-x-3 mb-2">
                 <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                 <span className="text-emerald-800 text-sm font-medium">Shopify Connected Successfully!</span>
              </div>
              
              <div className="space-y-2">
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 flex items-center space-x-2">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <span>Enter your Email to finalize AI setup</span>
                </label>
                <div className="relative">
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <button
                onClick={handleSetupRubikchat}
                disabled={!email}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                className="group relative w-full flex items-center justify-center space-x-2 bg-slate-900 hover:bg-black disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-medium py-3.5 px-6 rounded-xl shadow-sm transition-all overflow-hidden"
              >
                <span className="relative z-10 flex items-center space-x-2">
                  <span>Complete Setup</span>
                  <ArrowRight className={`w-4 h-4 transition-transform duration-300 ${isHovered && email ? 'translate-x-1' : ''}`} />
                </span>
              </button>
            </div>
          )}

          {status === 'setting_up_rubikchat' && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4 animate-in fade-in duration-500">
               <Loader2 className="w-10 h-10 text-slate-900 animate-spin" />
               <p className="text-slate-700 font-medium">Configuring RubikChat AI...</p>
            </div>
          )}

          {status === 'checking' && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4 animate-in fade-in duration-500">
               <Loader2 className="w-10 h-10 text-slate-900 animate-spin" />
               <p className="text-slate-700 font-medium">Verifying connection...</p>
            </div>
          )}

          {(status === 'idle' || status === 'connecting_shopify') && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-2">
                <label htmlFor="shop" className="block text-sm font-medium text-slate-700 flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-slate-400" />
                  <span>Store Domain</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    id="shop"
                    value={shopUrl}
                    onChange={(e) => setShopUrl(e.target.value)}
                    placeholder="your-store-name"
                    className="w-full pl-4 pr-36 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium pointer-events-none text-sm">
                    .myshopify.com
                  </div>
                </div>
              </div>

              <button
                onClick={handleConnectShopify}
                disabled={!shopUrl || status === 'connecting_shopify'}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                className="group relative w-full flex items-center justify-center space-x-2 bg-slate-900 hover:bg-black disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-medium py-3.5 px-6 rounded-xl shadow-sm transition-all overflow-hidden"
              >
                <span className="relative z-10 flex items-center space-x-2">
                  {status === 'connecting_shopify' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Connecting...</span>
                    </>
                  ) : (
                    <>
                      <span>Connect Store</span>
                      <ArrowRight className={`w-4 h-4 transition-transform duration-300 ${isHovered && shopUrl ? 'translate-x-1' : ''}`} />
                    </>
                  )}
                </span>
              </button>
            </div>
          )}

        </div>
        
        {/* Footer branding */}
        <div className="mt-8 flex items-center justify-center space-x-2 opacity-60 hover:opacity-100 transition-opacity duration-300 cursor-default">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
          <span className="text-slate-500 text-xs font-medium tracking-wide">
            Secured by RubikChat OAuth 2.0
          </span>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ConnectPage />} />
      <Route path="/functions" element={<FunctionsPage />} />
    </Routes>
  );
}
