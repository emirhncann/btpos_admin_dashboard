<?php

define('JWT_SECRET', 'btpos_jwt_secret_2026_change_in_production');
define('JWT_EXPIRY', 60 * 60 * 8); // 8 saat

function buildJWT(array $payload): string
{
    $header  = rtrim(strtr(base64_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT'])), '+/', '-_'), '=');
    $body    = rtrim(strtr(base64_encode(json_encode($payload)), '+/', '-_'), '=');
    $sig     = rtrim(strtr(base64_encode(hash_hmac('sha256', "$header.$body", JWT_SECRET, true)), '+/', '-_'), '=');
    return "$header.$body.$sig";
}

function verifyJWT(string $token): ?array
{
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        return null;
    }

    [$header, $body, $sig] = $parts;

    $expected = rtrim(strtr(base64_encode(hash_hmac('sha256', "$header.$body", JWT_SECRET, true)), '+/', '-_'), '=');
    if (!hash_equals($expected, $sig)) {
        return null;
    }

    $payload = json_decode(base64_decode(strtr($body, '-_', '+/')), true);
    if (!is_array($payload) || ($payload['exp'] ?? 0) < time()) {
        return null;
    }

    return $payload;
}
