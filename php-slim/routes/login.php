<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

return function ($app) {

    $app->post('/login', function (Request $request, Response $response) {
        try {
            $contentType = $request->getHeaderLine('Content-Type');

            if (str_contains($contentType, 'application/json')) {
                $data = json_decode($request->getBody()->getContents(), true);
            } else {
                $data = $request->getParsedBody();
            }

            $email    = trim($data['email'] ?? '');
            $password = $data['password'] ?? '';

            if (empty($email) || empty($password)) {
                $response->getBody()->write(json_encode([
                    'message' => 'E-posta ve şifre boş olamaz.'
                ]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(400);
            }

            $db   = getDBConnection();
            $stmt = $db->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
            $stmt->execute([$email]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$user || $password !== $user['password']) {
                $response->getBody()->write(json_encode([
                    'message' => 'E-posta veya şifre hatalı.'
                ]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(401);
            }

            $token = buildJWT([
                'sub'   => $user['id'],
                'email' => $user['email'],
                'iat'   => time(),
                'exp'   => time() + JWT_EXPIRY,
            ]);

            $response->getBody()->write(json_encode([
                'token' => $token,
                'user'  => [
                    'id'    => (int) $user['id'],
                    'name'  => trim($user['name'] . ' ' . ($user['surname'] ?? '')),
                    'email' => $user['email'],
                    'role'  => $user['role'] ?? 'admin',
                ],
            ]));

            return $response
                ->withHeader('Content-Type', 'application/json')
                ->withStatus(200);

        } catch (Exception $e) {
            $response->getBody()->write(json_encode([
                'message' => 'Sunucu hatası: ' . $e->getMessage()
            ]));
            return $response
                ->withHeader('Content-Type', 'application/json')
                ->withStatus(500);
        }
    });
};
