const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const shop = 'rubikchat-test-store.myshopify.com';
  const org = await prisma.rubikchat_organizations.findUnique({
    where: { store_url: shop },
    include: { agents: true }
  });
  console.log(JSON.stringify(org, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
