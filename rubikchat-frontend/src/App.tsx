import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Store, CheckCircle, XCircle, Sparkles, ArrowRight } from 'lucide-react';

function App() {
  const [shopUrl, setShopUrl] = useState('');
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [connectedShop, setConnectedShop] = useState('');
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const urlStatus = searchParams.get('status');
    const shop = searchParams.get('shop');

    if (urlStatus === 'success' && shop) {
      setStatus('success');
      setConnectedShop(shop);
    } else if (urlStatus === 'error') {
      setStatus('error');
    }
  }, [searchParams]);

  const handleConnect = () => {
    if (!shopUrl) return;
    
    let domain = shopUrl.trim();
    if (!domain.includes('.myshopify.com')) {
      domain = `${domain}.myshopify.com`;
    }
    
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
    window.location.href = `${backendUrl}/api/auth/shopify?shop=${domain}`;
  };

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

          {status === 'success' && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-5 flex items-start space-x-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-green-500/20 p-2 rounded-full">
                <CheckCircle className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <h3 className="text-green-400 font-semibold text-lg">Successfully Connected!</h3>
                <p className="text-green-300/80 text-sm mt-1">
                  Your store <strong className="text-green-200">{connectedShop}</strong> is now securely linked.
                </p>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 flex items-start space-x-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-red-500/20 p-2 rounded-full">
                <XCircle className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h3 className="text-red-400 font-semibold text-lg">Connection Failed</h3>
                <p className="text-red-300/80 text-sm mt-1">
                  We couldn't connect your store. Please double-check your URL and try again.
                </p>
              </div>
            </div>
          )}

          {status === 'idle' && (
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
                onClick={handleConnect}
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
