<?php
/**
 * Clínica Barcia — Webhook WhatsApp
 * Recibe respuestas de pacientes via Twilio y guarda el estado
 */

// ── CONFIGURACIÓN ──────────────────────────────────────────
define('TWILIO_AUTH_TOKEN', '546aa32bc1695276194a2a3fb8a678b1');
define('DATOS_FILE', __DIR__ . '/estados.json');
// ───────────────────────────────────────────────────────────

// Verificar firma de Twilio (seguridad)
function verificarFirmaTwilio() {
    $token    = TWILIO_AUTH_TOKEN;
    $url      = (isset($_SERVER['HTTPS']) ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'] . $_SERVER['REQUEST_URI'];
    $firma    = $_SERVER['HTTP_X_TWILIO_SIGNATURE'] ?? '';
    if (!$firma) return false;

    $params = $_POST;
    ksort($params);
    $cadena = $url;
    foreach ($params as $k => $v) $cadena .= $k . $v;

    $esperada = base64_encode(hash_hmac('sha1', $cadena, $token, true));
    return hash_equals($esperada, $firma);
}

// Leer estados guardados
function leerEstados() {
    if (!file_exists(DATOS_FILE)) return [];
    $data = json_decode(file_get_contents(DATOS_FILE), true);
    return is_array($data) ? $data : [];
}

// Guardar estados
function guardarEstados($estados) {
    file_put_contents(DATOS_FILE, json_encode($estados, JSON_PRETTY_PRINT));
}

// ── ENDPOINT: recibir respuesta de paciente (Twilio POST) ──
if ($_SERVER['REQUEST_METHOD'] === 'POST' && !isset($_GET['action'])) {

    // Verificar que viene de Twilio
    if (!verificarFirmaTwilio()) {
        http_response_code(403);
        exit('Forbidden');
    }

    $de      = $_POST['From'] ?? '';   // ej: whatsapp:+34612345678
    $mensaje = strtolower(trim($_POST['Body'] ?? ''));
    $tlf     = preg_replace('/[^0-9]/', '', $de); // solo números

    // Detectar respuesta
    $estado = null;
    if (preg_match('/^s[ií]/u', $mensaje) || $mensaje === 'si' || $mensaje === 'sí' || $mensaje === '1') {
        $estado = 'conf';
    } elseif (strpos($mensaje, 'cambio') !== false || $mensaje === '2') {
        $estado = 'camb';
    }

    if ($estado && $tlf) {
        $estados = leerEstados();
        $estados[$tlf] = [
            'estado'    => $estado,
            'mensaje'   => $_POST['Body'] ?? '',
            'timestamp' => date('Y-m-d H:i:s'),
        ];
        guardarEstados($estados);
    }

    // Responder a Twilio (TwiML vacío — no enviamos nada de vuelta al paciente)
    header('Content-Type: text/xml');
    echo '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
    exit;
}

// ── ENDPOINT: consultar estados desde la app HTML ──────────
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action']) && $_GET['action'] === 'estados') {
    header('Content-Type: application/json');
    header('Access-Control-Allow-Origin: *');
    echo json_encode(leerEstados());
    exit;
}

// ── ENDPOINT: test (para comprobar que funciona) ───────────
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action']) && $_GET['action'] === 'test') {
    header('Content-Type: application/json');
    echo json_encode([
        'ok'      => true,
        'mensaje' => 'Webhook Clínica Barcia activo',
        'hora'    => date('Y-m-d H:i:s'),
    ]);
    exit;
}

http_response_code(200);
echo 'OK';
