const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const shop = 'rubikchat-test-store.myshopify.com';
  
  // Delete the organization record so the user can reconnect
  await prisma.rubikchat_organizations.deleteMany({
    where: { store_url: shop }
  });
  
  console.log('Successfully deleted the organization record for ' + shop);
}
main().catch(console.error).finally(() => prisma.$disconnect());
