#!/usr/bin/env node

/**
 * Simple script to check Pika balance and debug credit issues
 */

const PIKA_DEV_KEY = process.env.PIKA_DEV_KEY;

if (!PIKA_DEV_KEY) {
  console.error('❌ Missing PIKA_DEV_KEY environment variable');
  process.exit(1);
}

async function checkPikaBalance() {
  try {
    console.log('🔍 Checking Pika balance...');
    console.log(`🔑 Using API key: ${PIKA_DEV_KEY.substring(0, 10)}...`);
    
    const response = await fetch('https://srkibaanghvsriahb.pika.art/proxy/realtime/balance', {
      method: 'GET',
      headers: {
        'Authorization': `DevKey ${PIKA_DEV_KEY}`,
        'X-Skill-Name': 'pikastream-video-meeting',
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`❌ Failed to check balance: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error('Error details:', errorText);
      return;
    }

    const balanceData = await response.json();
    
    console.log('✅ Balance check successful!');
    console.log('📊 Balance data:', JSON.stringify(balanceData, null, 2));
    
    if (balanceData.credits !== undefined) {
      console.log(`💰 Current balance: ${balanceData.credits} credits`);
      
      if (balanceData.credits < 100) {
        console.log('⚠️  Insufficient credits for AI session (minimum 100 required)');
      } else {
        console.log('✅ Sufficient credits for AI session');
      }
    }
    
    if (balanceData.balance !== undefined) {
      console.log(`💰 Alternative balance field: ${balanceData.balance}`);
    }
    
  } catch (error) {
    console.error('❌ Error checking balance:', error.message);
  }
}

async function checkActiveSessions() {
  try {
    console.log('\n🔍 Checking for active sessions...');
    
    // This endpoint might not exist, but let's try
    const response = await fetch('https://srkibaanghvsriahb.pika.art/proxy/realtime/sessions', {
      method: 'GET',
      headers: {
        'Authorization': `DevKey ${PIKA_DEV_KEY}`,
        'X-Skill-Name': 'pikastream-video-meeting',
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const sessionsData = await response.json();
      console.log('📊 Active sessions:', JSON.stringify(sessionsData, null, 2));
    } else {
      console.log(`ℹ️  Active sessions endpoint not available: ${response.status}`);
    }
    
  } catch (error) {
    console.log('ℹ️  Could not check active sessions:', error.message);
  }
}

async function testPikaConnection() {
  try {
    console.log('\n🔍 Testing basic Pika API connection...');
    
    const response = await fetch('https://srkibaanghvsriahb.pika.art/proxy/realtime/', {
      method: 'GET',
      headers: {
        'Authorization': `DevKey ${PIKA_DEV_KEY}`,
        'X-Skill-Name': 'pikastream-video-meeting',
        'Content-Type': 'application/json'
      }
    });

    console.log(`📡 API response status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ API connection successful');
      console.log('📊 Response:', JSON.stringify(data, null, 2));
    } else {
      console.log('⚠️  API connection failed');
    }
    
  } catch (error) {
    console.error('❌ API connection error:', error.message);
  }
}

async function main() {
  console.log('🚀 Pika Balance Checker');
  console.log('=====================');
  
  await testPikaConnection();
  await checkPikaBalance();
  await checkActiveSessions();
  
  console.log('\n💡 Recommendations:');
  console.log('- If balance shows 0 but website shows 9890, there might be a cache issue');
  console.log('- Try refreshing the Pika.me page or logging out/in');
  console.log('- Contact Pika support if balance discrepancy persists');
  console.log('- Wait 5-10 minutes for balance to sync if you just stopped sessions');
}

main().catch(console.error);
