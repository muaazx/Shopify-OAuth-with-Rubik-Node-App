import { useState, useEffect, useRef } from 'react';
import { useSearchParams, Routes, Route, useNavigate } from 'react-router-dom';
import { Store, CheckCircle, XCircle, X, Sparkles, ArrowRight, Mail, Loader2, ExternalLink } from 'lucide-react';
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
  const [loadingMessage, setLoadingMessage] = useState('');
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);
  const [showShopifyToast, setShowShopifyToast] = useState(false);
  const isSettingUpRef = useRef(false);

  const isEmbedded = searchParams.get('embedded') === '1' || window.self !== window.top;
  const initialShop = searchParams.get('shop');
  const initialToken = searchParams.get('state_token') || searchParams.get('token');

  const verifySession = async (shop: string, token: string | null) => {
    if (!token) {
      return true;
    }
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const res = await fetch(`${backendUrl}/api/verify-oauth-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ shop, token }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (token && window.history.replaceState) {
          const cleanUrl = window.location.pathname + '?shop=' + encodeURIComponent(shop);
          window.history.replaceState({}, document.title, cleanUrl);
        }
        return true;
      } else {
        setStatus('error');
        setErrorMessage(data.error || 'Access Denied: Invalid or expired session.');
        return false;
      }
    } catch (err) {
      return true;
    }
  };

  useEffect(() => {
    const urlStatus = searchParams.get('status');

    const initFlow = async () => {
      if (initialShop) {
        setShopUrl(initialShop);
        setConnectedShop(initialShop);
        setStatus('checking');

        const isValid = await verifySession(initialShop, initialToken);
        if (isValid) {
          checkStatus(initialShop, isEmbedded);
        }
      } else if (urlStatus === 'error') {
        setStatus('error');
        setErrorMessage('We couldn\'t connect your store. Please double-check your URL and try again.');
      }
    };

    initFlow();
  }, [searchParams, isEmbedded, initialShop, initialToken]);

  // Auto-dismiss the Shopify success toast after 3.5 seconds
  useEffect(() => {
    if (showShopifyToast) {
      const timer = setTimeout(() => setShowShopifyToast(false), 3500);
      return () => clearTimeout(timer);
    }
  }, [showShopifyToast]);

  // Show the toast only after the instructions popup is dismissed
  useEffect(() => {
    if (status === 'shopify_success' && !showInstructions) {
      setShowShopifyToast(true);
    }
  }, [showInstructions]);

  const checkStatus = async (shop: string, embeddedMode: boolean) => {
    // Prevent background status check from resetting active setup / onboarding flow
    if (isSettingUpRef.current) return;

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const res = await fetch(`${backendUrl}/api/status?shop=${shop}`);
      const data = await res.json();

      // Re-check guard after async operation to prevent race condition
      // where an in-flight status check resolves after setup has started
      if (isSettingUpRef.current) return;
      
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
      if (!isSettingUpRef.current) {
        setStatus('error');
        setErrorMessage('Failed to verify connection status.');
      }
    }
  };

  useEffect(() => {
    if (status === 'complete' || status === 'setting_up_rubikchat' || status === 'connecting_shopify' || !connectedShop) return;

    const checkNow = () => {
      checkStatus(connectedShop, isEmbedded);
    };

    const interval = setInterval(checkNow, 4000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkNow();
      }
    };

    const handleFocus = () => {
      checkNow();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [status, connectedShop, isEmbedded]);

  useEffect(() => {
    if (status === 'complete') {
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
    }
  }, [status]);

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

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setStatus('error');
      setErrorMessage('Email not valid, please try again with a valid mail');
      return;
    }
    
    setStatus('setting_up_rubikchat');
    setLoadingMessage('Registering account...');
    isSettingUpRef.current = true;
    
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      
      // Step 1: Register
      const registerRes = await fetch(`${backendUrl}/api/rubikchat/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop: connectedShop, email }),
      });
      
      const registerData = await registerRes.json();
      if (!registerRes.ok || !registerData.success) {
        isSettingUpRef.current = false;
        setStatus('error');
        setErrorMessage(registerData.error || 'Failed to register with RubikChat');
        return;
      }

      // Step 2: Show "Logging in..." loader for at least 1.5 seconds
      setLoadingMessage('Logging in to your account...');
      const loginLoaderStart = Date.now();

      // Step 3: Login
      const loginRes = await fetch(`${backendUrl}/api/rubikchat/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          shop: connectedShop, 
          email, 
          password: registerData.password 
        }),
      });

      const loginData = await loginRes.json();
      if (!loginRes.ok || !loginData.success) {
        isSettingUpRef.current = false;
        setStatus('error');
        setErrorMessage(loginData.error || 'Failed to log in to RubikChat');
        return;
      }

      // Save token
      if (loginData.token) {
        localStorage.setItem('rubik_auth_token', loginData.token);
      } else {
        localStorage.setItem('rubik_auth_token', 'authenticated');
      }

      // Enforce minimum 1.5s visible "Logging in..." loader
      const elapsed = Date.now() - loginLoaderStart;
      const remaining = Math.max(1500 - elapsed, 0);
      await new Promise(resolve => setTimeout(resolve, remaining));

      // Step 4: Create AI Agent automatically
      setLoadingMessage('Creating your AI agent...');
      const createAgentLoaderStart = Date.now();

      const agentRes = await fetch(`${backendUrl}/api/rubikchat/create-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop: connectedShop }),
      });

      const agentData = await agentRes.json();
      if (!agentRes.ok || !agentData.success) {
        isSettingUpRef.current = false;
        setStatus('error');
        setErrorMessage(agentData.error || 'Failed to create AI agent');
        return;
      }

      // Enforce minimum 1.5s visible "Creating your AI agent..." loader
      const agentElapsed = Date.now() - createAgentLoaderStart;
      const agentRemaining = Math.max(1500 - agentElapsed, 0);
      await new Promise(resolve => setTimeout(resolve, agentRemaining));

      isSettingUpRef.current = false;

      // Notify Shopify Admin iframe (if open) that setup is complete
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

      setStatus('complete');
      // Auto-redirect to functions page after successful agent creation
      navigate('/functions?shop=' + encodeURIComponent(connectedShop) + '&agentCreated=1');
    } catch (err) {
      isSettingUpRef.current = false;
      setStatus('error');
      setErrorMessage('Network error while setting up RubikChat');
    }
  };

  const handleOpenStandalone = () => {
    // Break out of iframe to the functions page
    window.open(window.location.origin + '/functions?shop=' + connectedShop, '_blank');
  };

  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const handleDisconnect = () => {
    if (!window.confirm('Are you sure you want to disconnect RubikChat from this shop? This will delete all integration configuration.')) {
      return;
    }
    
    setIsDisconnecting(true);
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
    const disconnectUrl = `${backendUrl}/api/shopify/disconnect?shop=${encodeURIComponent(connectedShop)}`;

    if (window.top) {
      window.top.location.href = disconnectUrl;
    } else {
      window.location.href = disconnectUrl;
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
                onClick={() => {
                  setIsRedirecting(true);
                  const urlParams = new URLSearchParams(window.location.search);
                  const shop = urlParams.get("shop") || "rubikchat-test-store.myshopify.com";
                  const backendOAuthUrl = `${backendUrl}/api/auth/shopify?shop=${encodeURIComponent(shop)}`;
                  window.open(backendOAuthUrl, '_blank');
                  setTimeout(() => setIsRedirecting(false), 6000);
                }}
                disabled={isRedirecting}
                className="inline-flex items-center space-x-2 bg-[#2c6ecb] hover:bg-[#1f5199] disabled:bg-[#85b1e8] text-white font-medium px-6 py-2.5 rounded-md shadow-sm transition-colors disabled:cursor-not-allowed"
              >
                {isRedirecting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Connecting to RubikChat...</span>
                  </>
                ) : (
                  <>
                    <span>Connect with RubikChat</span>
                    <ExternalLink className="w-4 h-4" />
                  </>
                )}
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
      {/* Floating success toast */}
      {showShopifyToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="bg-white border border-emerald-200 shadow-lg rounded-xl px-5 py-3 flex items-center space-x-3">
            <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span className="text-slate-800 text-sm font-medium">Shopify Connected Successfully!</span>
          </div>
        </div>
      )}
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
                   <h3 className="text-emerald-900 font-bold text-lg">Agent Created Successfully!</h3>
                   <p className="text-emerald-700 text-sm mt-1">Your AI agent is live and ready to assist your customers.</p>
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
                <button onClick={() => setStatus(connectedShop ? 'shopify_success' : 'idle')} className="mt-3 text-red-600 text-xs font-semibold hover:underline">Try Again</button>
              </div>
            </div>
          )}

          {status === 'shopify_success' && showInstructions && (
            <>
              {/* Backdrop overlay */}
              <div 
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 animate-in fade-in duration-300"
                onClick={() => setShowInstructions(false)}
              />
              {/* Instructions Popup */}
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-400">
                  {/* Header */}
                  <div className="flex items-center justify-between p-6 pb-4 border-b border-slate-100">
                    <h2 className="text-lg font-semibold text-slate-900">Before You Continue</h2>
                    <button
                      onClick={() => setShowInstructions(false)}
                      className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-lg transition-all"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Instructions List */}
                  <div className="p-6">
                    <ol className="list-decimal list-outside pl-5 space-y-3 text-sm text-slate-600 leading-relaxed">
                      <li>Use an email address that you can access. It will be used for account notifications, password recovery, and future communication.</li>
                      <li>A new RubikChat account will be created automatically using the email address you provide.</li>
                      <li>Your Shopify store will be securely connected to your RubikChat workspace.</li>
                      <li>An AI agent will be created and pre-configured specifically for your Shopify store.</li>
                      <li>Your store information will be used only to configure your AI agent and integration.</li>
                      <li>The initial setup may take 1–2 minutes. Please <strong className="text-slate-800">do not close, refresh, or navigate away</strong> from this page until the process is complete.</li>
                      <li>Once setup is complete, your screen will be refreshed automatically.</li>
                      <li>You can customize your AI agent, knowledge base, appearance, and automation rules at any time after setup.</li>
                    </ol>
                  </div>

                  {/* Footer */}
                  <div className="p-6 pt-2">
                    <button
                      onClick={() => setShowInstructions(false)}
                      className="w-full flex items-center justify-center space-x-2 bg-slate-900 hover:bg-black text-white font-medium py-3 px-6 rounded-xl shadow-sm transition-all"
                    >
                      <span>Got it, continue</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {status === 'shopify_success' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
               <p className="text-slate-700 font-medium">{loadingMessage}</p>
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
      <Route path="/onboarding" element={<ConnectPage />} />
      <Route path="/functions" element={<FunctionsPage />} />
    </Routes>
  );
}
