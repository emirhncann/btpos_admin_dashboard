<?php
require_once __DIR__ . '/../config/db.php';

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Routing\RouteCollectorProxy;

return function ($app) {
    // Sözleşme işlemleri grubu
    $app->group('/api/contracts', function (RouteCollectorProxy $group) {

        // Tüm sözleşmeleri getir (müşteri adıyla birlikte)
        $group->get('', function (Request $request, Response $response) {
            try {
                $db = getDBConnection();

                $sql = "SELECT 
    c.id, 
    c.contract_no, 
    c.status, 
    c.start_time, 
    c.end_time, 
    cust.c_name AS customer_name,
    cust.sozlesmeNote
FROM 
    contract c
LEFT JOIN 
    customer cust ON c.customer_ref = cust.id
ORDER BY 
    CASE WHEN c.status = 0 THEN 1 ELSE 0 END, -- Önce status 0 olmayanlar (0), sonra olanlar (1)
    c.id DESC; -- Kendi içlerinde yine ID'ye göre büyükten küçüğe
";

                $stmt = $db->query($sql);
                $contracts = $stmt->fetchAll(PDO::FETCH_ASSOC);

                $response->getBody()->write(json_encode([
                    'success' => true,
                    'contracts' => $contracts
                ], JSON_UNESCAPED_UNICODE));

                return $response->withHeader('Content-Type', 'application/json; charset=utf-8')->withStatus(200);

            } catch (Exception $e) {
                $response->getBody()->write(json_encode([
                    'success' => false,
                    'message' => $e->getMessage()
                ], JSON_UNESCAPED_UNICODE));
                return $response->withHeader('Content-Type', 'application/json')->withStatus(500);
            }
        });

        // Sözleşme tarihlerini güncelle
        $group->put('/{id}/dates', function (Request $request, Response $response, array $args) {
            try {
                $id = $args['id'];
                $input = json_decode($request->getBody()->getContents(), true);

                if (!isset($input['start_time']) && !isset($input['end_time'])) {
                    throw new Exception('start_time veya end_time belirtilmelidir');
                }

                $db = getDBConnection();

                $stmt = $db->prepare("SELECT id FROM contract WHERE id = ?");
                $stmt->execute([$id]);
                if (!$stmt->fetch()) {
                    throw new Exception('Sözleşme bulunamadı');
                }

                $fields = [];
                $params = [];

                if (isset($input['start_time'])) {
                    $fields[] = "start_time = ?";
                    $params[] = $input['start_time'];
                }

                if (isset($input['end_time'])) {
                    $fields[] = "end_time = ?";
                    $params[] = $input['end_time'];
                }

                $params[] = $id;

                $sql = "UPDATE contract SET " . implode(', ', $fields) . " WHERE id = ?";
                $stmt = $db->prepare($sql);
                $stmt->execute($params);

                $response->getBody()->write(json_encode([
                    'success' => true,
                    'message' => 'Sözleşme tarih(ler)i güncellendi'
                ], JSON_UNESCAPED_UNICODE));
                return $response->withHeader('Content-Type', 'application/json')->withStatus(200);

            } catch (Exception $e) {
                $response->getBody()->write(json_encode([
                    'success' => false,
                    'message' => $e->getMessage()
                ], JSON_UNESCAPED_UNICODE));
                 return $response->withHeader('Content-Type', 'application/json; charset=utf-8')->withStatus(200);
            }
        });

        // Sözleşme durumunu (status) güncelle
        $group->put('/{id}/status', function (Request $request, Response $response, array $args) {
            try {
                $id = $args['id'];
                $input = json_decode($request->getBody()->getContents(), true);

                if (!isset($input['status'])) {
                    throw new Exception('Status alanı gönderilmelidir');
                }

                $db = getDBConnection();

                $stmt = $db->prepare("SELECT id FROM contract WHERE id = ?");
                $stmt->execute([$id]);
                if (!$stmt->fetch()) {
                    throw new Exception('Sözleşme bulunamadı');
                }

                $sql = "UPDATE contract SET status = ? WHERE id = ?";
                $stmt = $db->prepare($sql);
                $stmt->execute([$input['status'], $id]);

                $response->getBody()->write(json_encode([
                    'success' => true,
                    'message' => 'Durum güncellendi'
                ], JSON_UNESCAPED_UNICODE));
                return $response->withHeader('Content-Type', 'application/json; charset=utf-8')->withStatus(200);

            } catch (Exception $e) {
                $response->getBody()->write(json_encode([
                    'success' => false,
                    'message' => $e->getMessage()
                ], JSON_UNESCAPED_UNICODE));
                return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
            }
        });
        
       



    });
};
