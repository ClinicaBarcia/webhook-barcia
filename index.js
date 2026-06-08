const http = require('http');
const https = require('https');
const fs = require('fs');
const querystring = require('querystring');

const ACCOUNT_SID = 'AC3e78bdd3ee6c134105e83495956d2865';
const AUTH_TOKEN = 'eff52124894f6660f471edb16f9cfc25';
const TWILIO_NUMBER = 'whatsapp:+34604090190';
const TEMPLATE_SID = 'HX2734563d4643472b62eca6229756e324';
const DATOS_FILE = '/tmp/estados.json';
const PORT = process.env.PORT || 3000;

function leerEstados() {
  try {
    if (fs.existsSync(DATOS_FILE)) return JSON.parse(fs.readFileSync(DATOS_FILE, 'utf8'));
  } catch(e) {}
  return {};
}

function guardarEstados(estados) {
  fs.writeFileSync(DATOS_FILE, JSON.stringify(estados, null, 2));
}

function enviarTemplate(tlf, nombre, fecha, hora) {
  return new Promise((resolve, reject) => {
    const to = 'whatsapp:+34' + tlf.replace(/[^0-9]/g,'').replace(/^34/,'');
    const data = querystring.stringify({
      From: TWILIO_NUMBER,
      To: to,
      ContentSid: TEMPLATE_SID,
      ContentVariables: JSON.stringify({ "1": nombre, "2": fecha, "3": hora })
    });
    const auth = Buffer.from(ACCOUNT_SID + ':' + AUTH_TOKEN).toString('base64');
    const options = {
      hostname: 'api.twilio.com',
      path: `/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + auth,
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = https.request(options, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch(e) { resolve({ error: body }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  corsHeaders(res);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Test
  if (req.method === 'GET' && url.searchParams.get('action') === 'test') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ ok: true, mensaje: 'Webhook Clínica Barcia activo', hora: new Date().toISOString() }));
    return;
  }

  // Estados
  if (req.method === 'GET' && url.searchParams.get('action') === 'estados') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(leerEstados()));
    return;
  }

  // Enviar plantilla via Twilio
  if (req.method === 'POST' && url.searchParams.get('action') === 'enviar') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const datos = JSON.parse(body);
        const resultado = await enviarTemplate(datos.tlf, datos.nombre, datos.fecha, datos.hora);
        if (resultado.sid) {
          res.writeHead(200, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ ok: true, sid: resultado.sid, status: resultado.status }));
        } else {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ ok: false, error: resultado.message || JSON.stringify(resultado) }));
        }
      } catch(e) {
        res.writeHead(500, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // Twilio webhook — respuestas entrantes de pacientes
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const params = querystring.parse(body);
      const de = params.From || '';
      const mensaje = (params.Body || '').toLowerCase().trim();
      const tlf = de.replace(/[^0-9]/g, '').replace(/^34/, '');

      let estado = null;
      if (/^s[ií]/.test(mensaje) || mensaje.includes('confirmo') || mensaje === '1') estado = 'conf';
      else if (mensaje.includes('cambiar') || mensaje.includes('cambio') || mensaje === '2') estado = 'camb';

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

  res.writeHead(200); res.end('OK');
});

server.listen(PORT, () => console.log(`Webhook corriendo en puerto ${PORT}`));
