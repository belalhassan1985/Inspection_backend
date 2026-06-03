async function main() {
  const campaignId = 'dcfbb532-986d-456f-9006-abbce232a76c';
  const url = `http://localhost:3001/reports/campaign/${campaignId}/word`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    
    console.log('Response Status:', response.status);
    console.log('Response Headers:', Object.fromEntries(response.headers.entries()));
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.log('Buffer Length:', buffer.length);
    if (buffer.length > 0) {
      console.log('First 50 characters as string:', buffer.toString('utf8', 0, Math.min(50, buffer.length)));
      console.log('First 4 bytes in hex:', buffer.slice(0, 4).toString('hex'));
    }
  } catch (error) {
    console.error('Error fetching download:', error);
  }
}

main();
