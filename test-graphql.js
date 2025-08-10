#!/usr/bin/env tsx

// Simple test for LuksoGraphQLService 
// Run with: yarn tsx test-graphql.js

import { GraphQLClient } from 'graphql-request';

const LUKSO_GRAPHQL_URL = 'https://envio.lukso-mainnet.universal.tech/v1/graphql';
const LUKSO_IPFS_GATEWAY = 'https://api.universalprofile.cloud/ipfs/';

const testAddresses = [
  '0xf4272e04412f38ec7e4d2e0bc3c63db8e281533a', // JAN
  '0xeea8420360d5e2ec7990d880515b88eb015a4e32', // DRIZZLE  
  '0xb2894bfdac8d21c2098196b2707c738f5533e0a8'  // LUKSO OG NFT
];

async function testGraphQLService() {
  console.log('🧪 Testing LUKSO GraphQL Service...\n');
  
  const client = new GraphQLClient(LUKSO_GRAPHQL_URL);
  
  const query = `
    query GetAssetMetadata($addresses: [String!]!) {
      Asset(where: { id: { _in: $addresses } }) {
        id
        lsp4TokenName
        lsp4TokenSymbol
        lsp4TokenType
        decimals
        isLSP7
        isCollection
        totalSupply
        description
        error
        icons { url }
        images { url }
      }
    }
  `;
  
  try {
    const response = await client.request(query, { 
      addresses: testAddresses.map(addr => addr.toLowerCase()) 
    });
    
    console.log(`✅ Found ${response.Asset.length} assets:\n`);
    
    response.Asset.forEach(asset => {
      console.log(`📋 ${asset.lsp4TokenName} (${asset.lsp4TokenSymbol})`);
      console.log(`   Address: ${asset.id}`);
      console.log(`   Type: LSP4TokenType=${asset.lsp4TokenType} ${asset.lsp4TokenType === 1 ? '(Multi-unit NFT)' : '(Token)'}`);
      console.log(`   Decimals: ${asset.decimals}`);
      console.log(`   Supply: ${asset.totalSupply}`);
      console.log(`   LSP7: ${asset.isLSP7}`);
      console.log(`   Icon: ${asset.icons?.[0]?.url ? 'Yes' : 'No'}`);
      console.log(`   Error: ${asset.error || 'None'}`);
      console.log('');
    });
    
    // Test classification logic
    console.log('🔍 Classification Test:');
    response.Asset.forEach(asset => {
      const isDivisible = asset.decimals > 0;
      const classification = asset.lsp4TokenType === 1 ? 'Multi-unit NFT' : 
                           asset.decimals === 0 ? 'Non-divisible' : 'Divisible';
      
      console.log(`   ${asset.lsp4TokenSymbol}: ${classification} (decimals=${asset.decimals}, isDivisible=${isDivisible})`);
    });
    
  } catch (error) {
    console.error('❌ GraphQL Test Failed:', error);
  }
}

testGraphQLService();
