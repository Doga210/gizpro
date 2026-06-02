export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  if (url.pathname === '/api/check-deposits') {
    return await checkDeposits(env);
  }
  if (url.pathname === '/api/link-ton') {
    return await linkTonAddress(request, env);
  }
  
  return new Response('Not Found', { status: 404 });
}

async function linkTonAddress(request, env) {
  const body = await request.json();
  await env.GIZ_KV.put('ton_user:' + body.tonAddress, body.userId);
  await env.GIZ_KV.put('user_ton:' + body.userId, body.tonAddress);
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function checkDeposits(env) {
  const TON_ADDRESS = 'UQAtucDs37OAhU3gTMUEBRxm8JhbUT2To3sxe3Qkc1mgHi3C';
  const response = await fetch(
    'https://toncenter.com/api/v2/getTransactions?address=' + TON_ADDRESS + '&limit=10'
  );
  const data = await response.json();
  
  for (const tx of data.result || []) {
    const txHash = tx.transaction_id.hash;
    const isProcessed = await env.GIZ_KV.get('processed:' + txHash);
    
    if (!isProcessed && tx.in_msg.value > 0) {
      const tonAmount = parseFloat(tx.in_msg.value) / 1e9;
      const sender = tx.in_msg.source;
      const userId = await env.GIZ_KV.get('ton_user:' + sender);
      
      if (userId) {
        const gizAmount = tonAmount * 0.1 * 0.98;
        const profit = tonAmount * 0.1 * 0.02;
        
        const balance = await env.GIZ_KV.get('balance:' + userId) || '0';
        await env.GIZ_KV.put('balance:' + userId, (parseFloat(balance) + gizAmount).toString());
        
        const totalProfit = await env.GIZ_KV.get('platform:profit') || '0';
        await env.GIZ_KV.put('platform:profit', (parseFloat(totalProfit) + profit).toString());
        
        await env.GIZ_KV.put('tx:' + txHash, JSON.stringify({
          userId, tonAmount, gizAmount, profit, sender, timestamp: Date.now()
        }));
      }
      
      await env.GIZ_KV.put('processed:' + txHash, 'true');
    }
  }
  
  return new Response(JSON.stringify({ checked: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

