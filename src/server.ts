import http from 'node:http';

const PORT = process.env.PORT || 3000;

async function getBody(req: http.IncomingMessage) {

  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }
  
  const body = Buffer.concat(chunks).toString();

  return JSON.parse(body);
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '', 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, {
      'Content-Type': 'application/json'
    })

    return res.end(
      JSON.stringify({
        status: 'ok'
      })
    )
  }

  if (req.method === 'POST' && url.pathname === '/accounts') {
    const body = await getBody(req);

    console.log(body);
    res.writeHead(201, {
      'Content-Type': 'application/json'
    })

    return res.end();

  }

  if (req.method === 'POST' && url.pathname === '/transfers') {
    res.writeHead(201, {
      'Content-Type': 'application/json'
    })

    return res.end()
  }

  if (req.method === 'GET' && url.pathname === '/transfers') {
    const id = url.searchParams.get('id');

    res.writeHead(201, {
      'Content-Type': 'application/json'
    })

    return res.end(JSON.stringify({ id: id }));
  }

  res.writeHead(404, {
    'Content-Type': 'application/json'
  })

  res.end(
    JSON.stringify({
      error: 'Route not found'
    })
  )
})

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});
