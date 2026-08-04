import { CheckCircle, ShoppingBag, Truck, ShoppingCart } from 'lucide-react';

interface McpResponseData {
  mcpCollectionId?: string | null;
  mcpConfigured?: boolean;
  featuresEnabled?: string[];
}

interface AgentSuccessPageProps {
  mcpResponseData?: McpResponseData;
}

export default function AgentSuccessPage({ mcpResponseData }: AgentSuccessPageProps) {
  return (
    <div style={{
      maxWidth: '560px',
      margin: '0 auto',
      padding: '24px',
      backgroundColor: '#fff',
      borderRadius: '12px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      border: '1px solid #f0f0f0',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <CheckCircle style={{ width: '32px', height: '32px', color: '#22c55e' }} />
        <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#1f2937', margin: 0 }}>
          Your AI Agent is Ready!
        </h2>
      </div>

      <p style={{ color: '#6b7280', marginBottom: '24px', fontSize: '14px', lineHeight: '1.5' }}>
        RubikChat MCP integrations were automatically configured. Your store widget can now handle customer actions seamlessly:
      </p>

      {/* Feature Capabilities Checklist */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          padding: '12px',
          backgroundColor: '#eff6ff',
          borderRadius: '8px',
        }}>
          <ShoppingBag style={{ width: '20px', height: '20px', color: '#2563eb', marginTop: '2px', flexShrink: 0 }} />
          <div>
            <h4 style={{ fontWeight: 600, color: '#1f2937', margin: '0 0 4px 0', fontSize: '14px' }}>
              Product Details & Catalog Search
            </h4>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: 0, lineHeight: '1.4' }}>
              Customers can ask for live product recommendations, pricing, and images.
            </p>
          </div>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          padding: '12px',
          backgroundColor: '#faf5ff',
          borderRadius: '8px',
        }}>
          <Truck style={{ width: '20px', height: '20px', color: '#9333ea', marginTop: '2px', flexShrink: 0 }} />
          <div>
            <h4 style={{ fontWeight: 600, color: '#1f2937', margin: '0 0 4px 0', fontSize: '14px' }}>
              Order Status & Tracking
            </h4>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: 0, lineHeight: '1.4' }}>
              Customers can check their order fulfillment and tracking info automatically.
            </p>
          </div>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          padding: '12px',
          backgroundColor: '#f0fdf4',
          borderRadius: '8px',
        }}>
          <ShoppingCart style={{ width: '20px', height: '20px', color: '#16a34a', marginTop: '2px', flexShrink: 0 }} />
          <div>
            <h4 style={{ fontWeight: 600, color: '#1f2937', margin: '0 0 4px 0', fontSize: '14px' }}>
              Automated Multi-Item Checkout
            </h4>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: 0, lineHeight: '1.4' }}>
              Customers can add products directly to their cart in conversation and get a 1-click Shopify checkout link!
            </p>
          </div>
        </div>
      </div>

      <div style={{
        padding: '16px',
        backgroundColor: '#f9fafb',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
      }}>
        <span style={{
          fontSize: '11px',
          fontWeight: 600,
          textTransform: 'uppercase' as const,
          color: '#9ca3af',
          display: 'block',
          marginBottom: '4px',
          letterSpacing: '0.05em',
        }}>
          RubikChat Status
        </span>
        <span style={{
          fontSize: '13px',
          fontWeight: 500,
          color: '#15803d',
          display: 'flex',
          alignItems: 'center',
        }}>
          <span style={{
            width: '8px',
            height: '8px',
            backgroundColor: '#22c55e',
            borderRadius: '50%',
            marginRight: '8px',
            display: 'inline-block',
          }}></span>
          MCP Actions Active
          {mcpResponseData?.mcpCollectionId && (
            <span style={{ color: '#9ca3af', marginLeft: '4px' }}>
              (Collection #{mcpResponseData.mcpCollectionId})
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
