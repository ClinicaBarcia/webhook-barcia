const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const querystring = require('querystring');

const AUTH_TOKEN = '546aa32bc1695276194a2a3fb8a678b1';
const DATOS_FILE = '/tmp/estados.json';
const PORT = process.env.PORT || 3000;

function leerEstados() {
  try {
    if (fs.existsSync(DATOS_FILE)) {
      return JSON.parse(fs.readFileSync(DATOS_FILE, 'utf8'));
    }
  } catch(e) {}
  return {};
}

function guardarEstados(estados) {
  fs.writeFileSync(DATOS_FILE, JSON.stringify(estados, null, 2));
}

function verificarFirma(url, params, firma) {
  const sortedParams = Object.keys(params).sort().reduce((acc, key) => {
    acc += key + params[key];
    return acc;
  }, url);
  const expected = crypto.createHmac('sha1', AUTH_TOKEN).update(sortedParams).digest('base64');
  return expected === firma;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Test endpoint
  if (req.method === 'GET' && url.searchParams.get('action') === 'test') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ ok: true, mensaje: 'Webhook Clínica Barcia activo', hora: new Date().toISOString() }));
    return;
  }

  // Estados endpoint
  if (req.method === 'GET' && url.searchParams.get('action') === 'estados') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(leerEstados()));
    return;
  }

  // Twilio webhook
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const params = querystring.parse(body);
      const de = params.From || '';
      const mensaje = (params.Body || '').toLowerCase().trim();
      const tlf = de.replace(/[^0-9]/g, '');

      let estado = null;
      if (/^s[ií]/.test(mensaje) || mensaje === 'si' || mensaje === 'sí' || mensaje === '1') {
        estado = 'conf';
      } else if (mensaje.includes('cambio') || mensaje === '2') {
        estado = 'camb';
      }

      if (estado && tlf) {
        const estados = leerEstados();
        estados[tlf] = { estado, mensaje: params.Body, timestamp: new Date().toISOString() };
        guardarEstados(estados);
      }

      res.writeHead(200, {'Content-Type': 'text/xml'});
      res.end('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    });
    return;
  }

  res.writeHead(200);
  res.end('OK');
});

server.listen(PORT, () => console.log(`Webhook corriendo en puerto ${PORT}`));
