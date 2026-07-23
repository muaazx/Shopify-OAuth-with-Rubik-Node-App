import { useState } from "react";

export default function CreateAgentPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("https://api-proxy-v1.rubikchat.com/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      setResponse(data);
    } catch (error: any) {
      setResponse({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <s-page heading="Create Agent">
      <s-section heading="Agent Login">
        <s-paragraph>
          Please enter your credentials below to authenticate.
        </s-paragraph>
        
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: "400px", marginTop: "1rem" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <label htmlFor="email" style={{ fontWeight: "bold", marginBottom: "4px" }}>Email</label>
            <input 
              type="email" 
              id="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required 
              style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <label htmlFor="password" style={{ fontWeight: "bold", marginBottom: "4px" }}>Password</label>
            <input 
              type="password" 
              id="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required 
              style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }}
            />
          </div>
          <button type="submit" disabled={loading} style={{ padding: "10px", background: "#000", color: "#fff", border: "none", borderRadius: "4px", cursor: loading ? "not-allowed" : "pointer" }}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        {response && (
          <div style={{ marginTop: "2rem", padding: "1rem", background: "#f4f4f4", borderRadius: "4px" }}>
            <h3 style={{ margin: "0 0 10px 0" }}>Response:</h3>
            <pre style={{ whiteSpace: "pre-wrap", wordWrap: "break-word", margin: 0 }}>
              {JSON.stringify(response, null, 2)}
            </pre>
          </div>
        )}
      </s-section>
    </s-page>
  );
}
