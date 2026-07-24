-- Add the RubikChat agent ID to Shopify integrations
ALTER TABLE "shopify_integrations"
ADD COLUMN IF NOT EXISTS "rubik_agent_id" TEXT;